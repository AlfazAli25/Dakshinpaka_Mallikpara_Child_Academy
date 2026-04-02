const mongoose = require('mongoose');

const feeSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    dueDate: { type: Date, required: true },
    amountDue: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['PENDING', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'PENDING_VERIFICATION'],
      default: 'PENDING',
      index: true
    },
    paymentDate: { type: Date },
    paymentMethod: { type: String, trim: true }
  },
  { timestamps: true }
);

feeSchema.index({ studentId: 1, dueDate: 1 });

module.exports = mongoose.model('Fee', feeSchema);