const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipientRole: { type: String, enum: ['admin', 'teacher'], default: 'admin', index: true },
    notificationType: { type: String, trim: true, default: 'GENERAL', index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
    studentName: { type: String, trim: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', index: true },
    teacherName: { type: String, trim: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    targetPath: { type: String, required: true, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
    submittedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['UNREAD', 'READ'], default: 'UNREAD', index: true },
    readAt: { type: Date }
  },
  { timestamps: true }
);

notificationSchema.index({ recipientRole: 1, status: 1, createdAt: -1 });
notificationSchema.index(
  { readAt: 1 },
  {
    expireAfterSeconds: 24 * 60 * 60,
    partialFilterExpression: { status: 'READ', readAt: { $exists: true } }
  }
);

module.exports = mongoose.model('Notification', notificationSchema);
