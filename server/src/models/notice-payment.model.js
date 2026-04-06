const mongoose = require('mongoose');

const PAYMENT_STATUSES = ['Paid', 'Pending'];

const noticePaymentSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    noticeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notice', required: true },
    amount: { type: Number, required: true, min: 0 },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'Paid'
    },
    paymentDate: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

noticePaymentSchema.index({ studentId: 1, noticeId: 1 }, { unique: true });
noticePaymentSchema.index({ noticeId: 1, paymentStatus: 1 });

const NoticePayment = mongoose.model('NoticePayment', noticePaymentSchema);

NoticePayment.PAYMENT_STATUSES = PAYMENT_STATUSES;

module.exports = NoticePayment;
