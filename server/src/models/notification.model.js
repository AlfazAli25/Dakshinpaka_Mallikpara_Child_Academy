const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipientRole: { type: String, enum: ['admin'], default: 'admin', index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
    studentName: { type: String, trim: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    targetPath: { type: String, required: true, trim: true },
    submittedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['UNREAD', 'READ'], default: 'UNREAD', index: true },
    readAt: { type: Date }
  },
  { timestamps: true }
);

notificationSchema.index({ recipientRole: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
