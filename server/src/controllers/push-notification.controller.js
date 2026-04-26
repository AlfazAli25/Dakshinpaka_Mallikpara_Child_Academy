const asyncHandler = require('../middleware/async.middleware');
const pushNotificationService = require('../services/push-notification.service');

const saveToken = asyncHandler(async (req, res) => {
  const targetUserId = String(req.body?.userId || '').trim();
  const requesterId = String(req.user?._id || '').trim();
  const requesterRole = String(req.user?.role || '').trim();

  if (requesterRole !== 'admin' && requesterId !== targetUserId) {
    return res.status(403).json({
      success: false,
      message: 'You can only save notification token for your own account'
    });
  }

  const tokenRecord = await pushNotificationService.saveToken({
    userId: targetUserId,
    token: req.body?.token
  });

  return res.status(201).json({
    success: true,
    message: 'Token saved successfully',
    data: {
      userId: tokenRecord.userId,
      token: tokenRecord.token,
      createdAt: tokenRecord.createdAt
    }
  });
});

const sendNotification = asyncHandler(async (req, res) => {
  const result = await pushNotificationService.sendNotificationToUser({
    userId: req.body?.userId,
    payload: {
      title: req.body?.title,
      body: req.body?.body,
      icon: req.body?.icon,
      clickAction: req.body?.clickAction
    }
  });

  return res.json({
    success: true,
    message: 'Notification sent',
    data: result
  });
});

const broadcastNotification = asyncHandler(async (req, res) => {
  const result = await pushNotificationService.broadcastNotification({
    payload: {
      title: req.body?.title,
      body: req.body?.body,
      icon: req.body?.icon,
      clickAction: req.body?.clickAction
    }
  });

  return res.json({
    success: true,
    message: 'Broadcast notification sent',
    data: result
  });
});

module.exports = {
  saveToken,
  sendNotification,
  broadcastNotification
};
