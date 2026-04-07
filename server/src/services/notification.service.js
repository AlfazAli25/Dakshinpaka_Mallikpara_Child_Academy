const Notification = require('../models/notification.model');
const payrollService = require('./payroll.service');

const READ_RETENTION_MS = 24 * 60 * 60 * 1000;

const buildVisibleNotificationsQuery = ({ recipientRole, teacherId } = {}) => {
  const cutoff = new Date(Date.now() - READ_RETENTION_MS);
  const query = {
    recipientRole,
    $or: [
      { status: 'UNREAD' },
      { status: 'READ', readAt: { $gte: cutoff } }
    ]
  };

  if (teacherId) {
    query.teacherId = teacherId;
  }

  return query;
};

const toAmount = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return Number(numeric.toFixed(2));
};

const notifyAdminPaymentSubmitted = async ({ studentId, studentName, paymentId }) =>
  Notification.create({
    recipientRole: 'admin',
    notificationType: 'STUDENT_PAYMENT_SUBMITTED',
    studentId,
    studentName,
    paymentId,
    title: 'Payment submitted',
    message: `${studentName} submitted a payment screenshot`,
    targetPath: `/admin/students/${studentId}`,
    submittedAt: new Date(),
    status: 'UNREAD'
  });

const purgeReadNotificationsPastRetention = async ({ recipientRole, teacherId } = {}) => {
  const cutoff = new Date(Date.now() - READ_RETENTION_MS);
  const filter = {
    recipientRole,
    status: 'READ',
    readAt: { $lt: cutoff }
  };

  if (teacherId) {
    filter.teacherId = teacherId;
  }

  await Notification.deleteMany(filter);
};

const listAdminNotifications = async () => {
  await purgeReadNotificationsPastRetention({ recipientRole: 'admin' });
  return Notification.find(buildVisibleNotificationsQuery({ recipientRole: 'admin' }))
    .sort({ status: 1, submittedAt: -1 })
    .limit(30);
};

const listTeacherNotifications = async ({ teacherId }) => {
  await purgeReadNotificationsPastRetention({ recipientRole: 'teacher', teacherId });
  return Notification.find(buildVisibleNotificationsQuery({ recipientRole: 'teacher', teacherId }))
    .sort({ status: 1, submittedAt: -1 })
    .limit(30);
};

const markAdminNotificationRead = async (notificationId) =>
  Notification.findByIdAndUpdate(notificationId, { status: 'READ', readAt: new Date() }, { new: true });

const respondTeacherSalaryConfirmation = async ({ notificationId, teacherId, decision }) => {
  const normalizedDecision = String(decision || '').trim().toUpperCase();
  if (!['YES', 'NO'].includes(normalizedDecision)) {
    const error = new Error('Please choose either Yes or No');
    error.statusCode = 400;
    throw error;
  }

  const notification = await Notification.findOne({
    _id: notificationId,
    recipientRole: 'teacher',
    teacherId
  });

  if (!notification) {
    return null;
  }

  if (notification.notificationType !== 'TEACHER_SALARY_PAYMENT_CONFIRMATION') {
    const error = new Error('This notification cannot be used for salary confirmation');
    error.statusCode = 400;
    throw error;
  }

  const metadata = notification.metadata || {};
  if (metadata.status !== 'PENDING') {
    const error = new Error('This salary payment request has already been handled');
    error.statusCode = 400;
    throw error;
  }

  const now = new Date();
  if (normalizedDecision === 'YES') {
    const paymentResult = await payrollService.finalizeTeacherSalaryPaymentByAdmin({
      teacherId: notification.teacherId,
      amount: toAmount(metadata.amount),
      month: metadata.month || undefined,
      paymentMethod: metadata.paymentMethod || 'Via Online',
      adminUserId: notification.adminId
    });

    notification.metadata = {
      ...metadata,
      status: 'CONFIRMED',
      decision: 'YES',
      respondedAt: now.toISOString(),
      receiptNumber: paymentResult?.receipt?.receiptNumber || ''
    };
    notification.status = 'READ';
    notification.readAt = now;
    await notification.save();

    return {
      notification,
      paymentResult,
      decision: normalizedDecision
    };
  }

  notification.metadata = {
    ...metadata,
    status: 'REJECTED',
    decision: 'NO',
    respondedAt: now.toISOString()
  };
  notification.status = 'READ';
  notification.readAt = now;
  await notification.save();

  await Notification.create({
    recipientRole: 'admin',
    notificationType: 'TEACHER_SALARY_PAYMENT_REJECTED',
    teacherId: notification.teacherId,
    teacherName: notification.teacherName,
    adminId: notification.adminId,
    title: 'Salary payment issue',
    message: 'Teacher did not get the amount, Check the payment Again.',
    targetPath: `/admin/teachers/${String(notification.teacherId || '')}`,
    submittedAt: now,
    status: 'UNREAD',
    metadata: {
      sourceNotificationId: String(notification._id),
      amount: toAmount(metadata.amount),
      paymentMethod: metadata.paymentMethod || 'Via Online',
      month: metadata.month || ''
    }
  });

  return {
    notification,
    decision: normalizedDecision
  };
};

module.exports = {
  notifyAdminPaymentSubmitted,
  listAdminNotifications,
  listTeacherNotifications,
  markAdminNotificationRead,
  respondTeacherSalaryConfirmation
};
