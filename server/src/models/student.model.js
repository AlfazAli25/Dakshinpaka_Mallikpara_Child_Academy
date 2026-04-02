const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    admissionNo: { type: String, required: true, unique: true, trim: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    gender: { type: String, trim: true },
    dob: { type: Date },
    guardianContact: { type: String, trim: true },
    address: { type: String, trim: true },
    pendingFees: { type: Number, min: 0, default: 0 },
    attendance: { type: Number, min: 0, max: 100, default: 0 }
  },
  { timestamps: true }
);

studentSchema.index({ classId: 1 });

module.exports = mongoose.model('Student', studentSchema);