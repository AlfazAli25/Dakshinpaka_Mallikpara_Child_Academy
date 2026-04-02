const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema(
  {
    receiptNumber: { type: String, required: true, unique: true, trim: true },
    receiptType: { type: String, enum: ['FEE', 'SALARY'], required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', index: true },
    feeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fee', index: true },
    payrollId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payroll', index: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', index: true, unique: true, sparse: true },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    studentName: { type: String, trim: true },
    className: { type: String, trim: true },
    teacherName: { type: String, trim: true },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, trim: true, required: true },
    paymentDate: { type: Date, required: true },
    transactionReference: { type: String, trim: true },
    status: { type: String, trim: true, required: true },
    pendingSalaryCleared: { type: Number, min: 0 }
  },
  { timestamps: true }
);

receiptSchema.index({ studentId: 1, createdAt: -1 });
receiptSchema.index({ teacherId: 1, createdAt: -1 });

module.exports = mongoose.model('Receipt', receiptSchema);
