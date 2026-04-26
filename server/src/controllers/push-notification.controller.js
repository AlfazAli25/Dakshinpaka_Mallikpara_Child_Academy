const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async.middleware');
const pushNotificationService = require('../services/push-notification.service');
const User = require('../models/user.model');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');

const resolveUserIdFromIdentifier = async (identifier = '') => {
  const normalizedIdentifier = String(identifier || '').trim();
  if (!normalizedIdentifier) {
    return '';
  }

  if (mongoose.Types.ObjectId.isValid(normalizedIdentifier)) {
    const user = await User.findById(normalizedIdentifier).select('_id').lean();
    if (user?._id) {
      return String(user._id);
    }
  }

  if (normalizedIdentifier.includes('@')) {
    const user = await User.findOne({ email: normalizedIdentifier.toLowerCase() })
      .select('_id')
      .lean();
    if (user?._id) {
      return String(user._id);
    }
  }

  const student = await Student.findOne({ admissionNo: normalizedIdentifier }).select('userId').lean();
  if (student?.userId) {
    return String(student.userId);
  }

  const teacher = await Teacher.findOne({ teacherId: normalizedIdentifier }).select('userId').lean();
  if (teacher?.userId) {
    return String(teacher.userId);
  }

  return '';
};

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

const sendNotificationByIdentifier = asyncHandler(async (req, res) => {
  const resolvedUserId = await resolveUserIdFromIdentifier(req.body?.identifier);
  if (!resolvedUserId) {
    return res.status(404).json({
      success: false,
      message: 'No user found for the provided identifier'
    });
  }

  const result = await pushNotificationService.sendNotificationToUser({
    userId: resolvedUserId,
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
    data: {
      userId: resolvedUserId,
      ...result
    }
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
  sendNotificationByIdentifier,
  broadcastNotification
};
