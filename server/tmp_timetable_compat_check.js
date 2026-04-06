require('dotenv').config();
const connectDB = require('./src/config/db');
const timetableService = require('./src/services/timetable.service');
const ClassModel = require('./src/models/class.model');
const Subject = require('./src/models/subject.model');
const Teacher = require('./src/models/teacher.model');
const User = require('./src/models/user.model');
const Timetable = require('./src/models/timetable.model');

(async () => {
  await connectDB();
  const suffix = Date.now().toString().slice(-6);

  const user = await User.create({
    name: `Tmp Teacher ${suffix}`,
    email: `tmp.teacher.${suffix}@example.com`,
    passwordHash: 'x',
    role: 'teacher'
  });

  const cls = await ClassModel.create({ name: `TMP${suffix}`, section: 'B' });
  const teacher = await Teacher.create({
    userId: user._id,
    teacherId: `TMP${suffix}`,
    classIds: [cls._id],
    subjects: []
  });

  // Legacy format: subject.teacherId stores Teacher profile _id instead of User _id.
  const subject = await Subject.create({
    name: `TMPSUB${suffix}`,
    code: `TMP${suffix}`,
    classId: cls._id,
    teacherId: teacher._id
  });

  await Teacher.findByIdAndUpdate(teacher._id, { $addToSet: { subjects: subject._id } });

  const created = await timetableService.createEntry({
    payload: {
      classId: cls._id,
      section: 'B',
      day: 'Monday',
      periodNumber: 1,
      subjectId: subject._id,
      teacherId: user._id,
      startTime: '11:00',
      endTime: '11:40'
    },
    createdBy: user._id
  });

  console.log('created-ok', Boolean(created?._id));

  const freshSubject = await Subject.findById(subject._id).lean();
  console.log('subject-teacher-now-user-id', String(freshSubject?.teacherId || '') === String(user._id));

  await Timetable.deleteMany({ _id: created?._id });
  await Subject.deleteMany({ _id: subject._id });
  await Teacher.deleteMany({ _id: teacher._id });
  await ClassModel.deleteMany({ _id: cls._id });
  await User.deleteMany({ _id: user._id });
})();
