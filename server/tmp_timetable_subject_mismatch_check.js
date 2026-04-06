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

  const oldUser = await User.create({ name: `Old Teacher ${suffix}`, email: `old.teacher.${suffix}@example.com`, passwordHash: 'x', role: 'teacher' });
  const oldTeacher = await Teacher.create({ userId: oldUser._id, teacherId: `OLD${suffix}`, classIds: [], subjects: [] });

  const selectedUser = await User.create({ name: `Selected Teacher ${suffix}`, email: `selected.teacher.${suffix}@example.com`, passwordHash: 'x', role: 'teacher' });
  const selectedTeacher = await Teacher.create({ userId: selectedUser._id, teacherId: `SEL${suffix}`, classIds: [], subjects: [] });

  const cls = await ClassModel.create({ name: `TMP${suffix}`, section: 'B' });

  // Stale mapping: subject.teacherId points to old teacher profile, but selected teacher profile owns subject.
  const subject = await Subject.create({ name: `TMPSUB${suffix}`, code: `TMP${suffix}`, classId: cls._id, teacherId: oldTeacher._id });
  await Teacher.findByIdAndUpdate(selectedTeacher._id, { $addToSet: { subjects: subject._id, classIds: cls._id } });

  const created = await timetableService.createEntry({
    payload: {
      classId: cls._id,
      section: 'B',
      day: 'Monday',
      periodNumber: 1,
      subjectId: subject._id,
      teacherId: selectedUser._id,
      startTime: '11:00',
      endTime: '11:40'
    },
    createdBy: selectedUser._id
  });

  console.log('created-ok', Boolean(created?._id));
  const refreshedSubject = await Subject.findById(subject._id).lean();
  console.log('healed-to-selected-user', String(refreshedSubject?.teacherId || '') === String(selectedUser._id));

  await Timetable.deleteMany({ _id: created?._id });
  await Subject.deleteMany({ _id: subject._id });
  await Teacher.deleteMany({ _id: { $in: [oldTeacher._id, selectedTeacher._id] } });
  await ClassModel.deleteMany({ _id: cls._id });
  await User.deleteMany({ _id: { $in: [oldUser._id, selectedUser._id] } });
})();
