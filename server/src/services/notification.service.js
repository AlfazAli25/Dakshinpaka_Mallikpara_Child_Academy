const Notification = require('../models/notification.model');

const notifyAdminPaymentSubmitted = async ({ studentId, studentName, paymentId }) =>
  Notification.create({
    recipientRole: 'admin',
    studentId,
    studentName,
    paymentId,
    title: 'Payment submitted',
    message: `${studentName} submitted a payment screenshot`,
    targetPath: `/admin/students/${studentId}`,
    submittedAt: new Date(),
    status: 'UNREAD'
  });

const listAdminNotifications = async () =>
  Notification.find({ recipientRole: 'admin' }).sort({ status: 1, submittedAt: -1 }).limit(30);

const markAdminNotificationRead = async (notificationId) =>
  Notification.findByIdAndUpdate(notificationId, { status: 'READ', readAt: new Date() }, { new: true });

module.exports = {
  notifyAdminPaymentSubmitted,
  listAdminNotifications,
  markAdminNotificationRead
};
