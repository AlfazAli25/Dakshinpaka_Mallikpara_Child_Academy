const asyncHandler = require('../middleware/async.middleware');
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

module.exports = { listAdmin, markRead };
