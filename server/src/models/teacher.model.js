const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    teacherId: { type: String, required: true, unique: true, trim: true },
    classIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
    contactNumber: { type: String, trim: true },
    monthlySalary: { type: Number, min: 0, default: 0 },
    pendingSalary: { type: Number, min: 0, default: 0 },
    department: { type: String, trim: true },
    qualifications: { type: String, trim: true },
    joiningDate: { type: Date }
  },
  { timestamps: true }
);

teacherSchema.index({ classIds: 1 });
teacherSchema.index({ userId: 1 }, { unique: true });
teacherSchema.index({ subjects: 1 });

module.exports = mongoose.model('Teacher', teacherSchema);