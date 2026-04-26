const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate.middleware');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/push-notification.controller');

const router = express.Router();

router.post(
  '/save-token',
  protect,
  [
    body('userId').isString().notEmpty().withMessage('userId is required'),
    body('token').isString().isLength({ min: 30 }).withMessage('A valid FCM token is required')
  ],
  validate,
  controller.saveToken
);

router.post(
  '/send-notification',
  protect,
  requireRole(['admin']),
  [
    body('userId').isString().notEmpty().withMessage('userId is required'),
    body('title').isString().notEmpty().withMessage('title is required'),
    body('body').isString().notEmpty().withMessage('body is required'),
    body('icon').optional().isString().isLength({ max: 300 }),
    body('clickAction').optional().isString().isLength({ max: 300 })
  ],
  validate,
  controller.sendNotification
);

router.post(
  '/send-notification/by-identifier',
  protect,
  requireRole(['admin']),
  [
    body('identifier').isString().notEmpty().withMessage('identifier is required'),
    body('title').isString().notEmpty().withMessage('title is required'),
    body('body').isString().notEmpty().withMessage('body is required'),
    body('icon').optional().isString().isLength({ max: 300 }),
    body('clickAction').optional().isString().isLength({ max: 300 })
  ],
  validate,
  controller.sendNotificationByIdentifier
);

router.post(
  '/broadcast-notification',
  protect,
  requireRole(['admin']),
  [
    body('title').isString().notEmpty().withMessage('title is required'),
    body('body').isString().notEmpty().withMessage('body is required'),
    body('icon').optional().isString().isLength({ max: 300 }),
    body('clickAction').optional().isString().isLength({ max: 300 })
  ],
  validate,
  controller.broadcastNotification
);

module.exports = router;
