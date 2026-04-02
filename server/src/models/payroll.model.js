const mongoose = require('mongoose');

const payrollSchema = new mongoose.Schema(
  {
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', index: true },
    month: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    paidOn: { type: Date },
    status: { type: String, enum: ['Pending', 'Paid'], default: 'Pending' },
    paymentMethod: { type: String, trim: true, default: 'BANK_TRANSFER' },
    processedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    pendingSalaryCleared: { type: Number, min: 0, default: 0 },
    receiptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Receipt' }
  },
  { timestamps: true }
);

payrollSchema.index({ staffId: 1, month: 1 }, { unique: true });
payrollSchema.index({ teacherId: 1, month: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Payroll', payrollSchema);