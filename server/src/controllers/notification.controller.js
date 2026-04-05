const asyncHandler = require('../middleware/async.middleware');
const Teacher = require('../models/teacher.model');
const notificationService = require('../services/notification.service');
const { createActionLog } = require('../services/action-log.service');

const listAdmin = asyncHandler(async (req, res) => {
  const notifications = await notificationService.listAdminNotifications();
  const unreadCount = notifications.filter((item) => item.status === 'UNREAD').length;

  res.json({ success: true, data: { notifications, unreadCount } });
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markAdminNotificationRead(req.params.id);
  if (!notification) {
    return res.status(404).json({ success: false, message: 'Notification not found' });
  }

  await createActionLog({
    actorId: req.user._id,
    action: 'NOTIFICATION_MARK_READ',
    module: 'NOTIFICATION',
    entityId: String(notification._id),
    metadata: { targetPath: notification.targetPath }
  });

  return res.json({ success: true, data: notification });
});

const listTeacher = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findOne({ userId: req.user._id }).select('_id');
  if (!teacher) {
    return res.status(404).json({ success: false, message: 'Teacher record not found' });
  }

  const notifications = await notificationService.listTeacherNotifications({ teacherId: teacher._id });
  const unreadCount = notifications.filter((item) => item.status === 'UNREAD').length;

  return res.json({ success: true, data: { notifications, unreadCount } });
});

const respondTeacherSalaryPayment = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findOne({ userId: req.user._id }).select('_id');
  if (!teacher) {
    return res.status(404).json({ success: false, message: 'Teacher record not found' });
  }

  const result = await notificationService.respondTeacherSalaryConfirmation({
    notificationId: req.params.id,
    teacherId: teacher._id,
    decision: req.body?.decision
  });

  if (!result?.notification) {
    return res.status(404).json({ success: false, message: 'Notification not found' });
  }

  await createActionLog({
    actorId: req.user._id,
    action: result.decision === 'YES' ? 'TEACHER_SALARY_PAYMENT_CONFIRMED' : 'TEACHER_SALARY_PAYMENT_REJECTED',
    module: 'PAYROLL',
    entityId: String(result.notification._id),
    metadata: {
      decision: result.decision,
      targetPath: result.notification.targetPath
    }
  });

  return res.json({
    success: true,
    message:
      result.decision === 'YES'
        ? 'Salary payment confirmed. Payroll updated and receipt generated.'
        : 'Teacher did not receive the amount. Admin has been notified to recheck payment.',
    data: {
      notification: result.notification,
      summary:
        result.decision === 'YES'
          ? {
              amountApplied: result.paymentResult?.amountApplied || 0,
              totalPendingBefore: result.paymentResult?.totalPendingBefore || 0,
              totalPendingAfter: result.paymentResult?.totalPendingAfter || 0,
              allocations: result.paymentResult?.allocations || []
            }
          : undefined
    }
  });
});

module.exports = { listAdmin, markRead, listTeacher, respondTeacherSalaryPayment };
