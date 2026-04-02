const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    teacherId: { type: String, required: true, unique: true, trim: true },
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
    department: { type: String, trim: true },
    qualifications: { type: String, trim: true },
    joiningDate: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Teacher', teacherSchema);