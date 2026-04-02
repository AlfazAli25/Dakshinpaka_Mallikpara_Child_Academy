const mongoose = require('mongoose');

const paymentLogSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ['REQUEST', 'WEBHOOK'], required: true },
    status: { type: String, trim: true },
    message: { type: String, trim: true },
    payload: { type: mongoose.Schema.Types.Mixed }
  },
  { _id: false, timestamps: true }
);

const paymentSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    feeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fee', required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    transactionId: { type: String, required: true, unique: true, trim: true },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PENDING_VERIFICATION', 'SUCCESS', 'FAILED', 'CANCELLED'],
      default: 'PENDING',
      index: true
    },
    providerOrderId: { type: String, trim: true },
    providerReferenceId: { type: String, trim: true },
    paymentMethod: { type: String, trim: true, default: 'SMEPAY_QR' },
    screenshotPath: { type: String, trim: true },
    processedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    verificationNotes: { type: String, trim: true },
    qrCodeData: { type: String, trim: true },
    rawProviderResponse: { type: mongoose.Schema.Types.Mixed },
    logs: { type: [paymentLogSchema], default: [] },
    paidAt: { type: Date }
  },
  { timestamps: true }
);

paymentSchema.index({ studentId: 1, createdAt: -1 });
paymentSchema.index({ feeId: 1, paymentStatus: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);