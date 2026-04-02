const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema(
  {
    day: { type: String, required: true, trim: true },
    time: { type: String, required: true, trim: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true }
  },
  { _id: false }
);

const timetableSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, unique: true },
    schedule: [scheduleSchema]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Timetable', timetableSchema);