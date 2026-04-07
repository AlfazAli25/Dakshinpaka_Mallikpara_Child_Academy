const express = require('express');
const { body, param, query } = require('express-validator');
const { protect, requireRole } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const noticeController = require('../controllers/noticeController');
const noticePaymentController = require('../controllers/noticePaymentController');
const { screenshotUpload } = require('../middleware/upload.middleware');

const router = express.Router();

router.post(
  '/',
  protect,
  requireRole(['admin']),
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('recipientRole').optional().isIn(['student', 'teacher', 'all']).withMessage('Recipient role must be student, teacher, or all'),
    body('classIds').optional().isArray().withMessage('classIds must be an array'),
    body('classIds.*').optional().isMongoId().withMessage('Invalid class selected'),
    body('noticeType').optional().isIn(['General', 'Payment']).withMessage('Notice type must be General or Payment'),
    body('amount').optional().isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
    body('dueDate').optional({ nullable: true }).isISO8601().withMessage('Due date is invalid'),
    body('isImportant').optional().isBoolean().withMessage('isImportant must be true or false'),
    body('status').optional().isIn(['Active', 'Expired']).withMessage('Status must be Active or Expired')
  ],
  validate,
  noticeController.createNotice
);

router.get(
  '/student',
  protect,
  requireRole(['student']),
  [
    query('noticeId').optional().isMongoId().withMessage('Notice is invalid'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validate,
  noticeController.getStudentNotices
);

router.get(
  '/teacher',
  protect,
  requireRole(['teacher']),
  [
    query('noticeId').optional().isMongoId().withMessage('Notice is invalid'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validate,
  noticeController.getTeacherNotices
);

router.post(
  '/pay',
  protect,
  requireRole(['student']),
  screenshotUpload.single('screenshot'),
  [
    body('studentId').optional().isMongoId().withMessage('Student is invalid'),
    body('noticeId').notEmpty().withMessage('Notice is required').bail().isMongoId().withMessage('Notice is invalid'),
    body('amount').notEmpty().withMessage('Amount is required').bail().isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
    body('transactionReference').optional().isString().isLength({ max: 120 }).withMessage('Transaction reference is too long')
  ],
  validate,
  noticePaymentController.payNotice
);

router.get(
  '/payments/pending',
  protect,
  requireRole(['admin']),
  noticePaymentController.listPendingNoticePayments
);

router.get(
  '/payments/history',
  protect,
  requireRole(['admin']),
  [
    query('noticeId').optional().isMongoId().withMessage('Notice is invalid'),
    query('paymentStatus')
      .optional()
      .custom((value) => {
        const normalized = String(value || '').trim().toUpperCase();
        if (['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'PENDING', 'PAID'].includes(normalized)) {
          return true;
        }

        throw new Error('Payment status must be PENDING_VERIFICATION, VERIFIED, or REJECTED');
      }),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1'),
    query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('Limit must be between 1 and 200')
  ],
  validate,
  noticePaymentController.listNoticePaymentHistory
);

router.get(
  '/payments/by-notice',
  protect,
  requireRole(['admin']),
  [query('noticeId').notEmpty().withMessage('Notice is required').bail().isMongoId().withMessage('Notice is invalid')],
  validate,
  noticePaymentController.listNoticePaymentsByNotice
);

router.post(
  '/payments/cash',
  protect,
  requireRole(['admin']),
  [
    body('studentId').notEmpty().withMessage('Student is required').bail().isMongoId().withMessage('Student is invalid'),
    body('noticeId').notEmpty().withMessage('Notice is required').bail().isMongoId().withMessage('Notice is invalid'),
    body('amount').optional().isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
    body('transactionReference').optional().isString().isLength({ max: 120 }).withMessage('Transaction reference is too long'),
    body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes must be under 500 characters')
  ],
  validate,
  noticePaymentController.recordCashNoticePayment
);

router.post(
  '/payments/:paymentId/verify',
  protect,
  requireRole(['admin']),
  [
    param('paymentId').isMongoId().withMessage('Notice payment is invalid'),
    body('decision').isIn(['APPROVE', 'REJECT']).withMessage('Decision must be APPROVE or REJECT'),
    body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes must be under 500 characters')
  ],
  validate,
  noticePaymentController.verifyNoticePayment
);

router.get(
  '/',
  protect,
  requireRole(['admin']),
  [
    query('status').optional().isIn(['Active', 'Expired']).withMessage('Status must be Active or Expired'),
    query('noticeType').optional().isIn(['General', 'Payment']).withMessage('Notice type must be General or Payment'),
    query('recipientRole').optional().isIn(['student', 'teacher', 'all']).withMessage('Recipient role must be student, teacher, or all'),
    query('classId').optional().isMongoId().withMessage('Class is invalid'),
    query('isImportant').optional().isIn(['true', 'false']).withMessage('isImportant must be true or false'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validate,
  noticeController.getAllNotices
);

router.put(
  '/:id',
  protect,
  requireRole(['admin']),
  [
    param('id').isMongoId().withMessage('Notice is invalid'),
    body('title').optional().notEmpty().withMessage('Title cannot be empty'),
    body('description').optional().notEmpty().withMessage('Description cannot be empty'),
    body('recipientRole').optional().isIn(['student', 'teacher', 'all']).withMessage('Recipient role must be student, teacher, or all'),
    body('classIds').optional().isArray().withMessage('classIds must be an array'),
    body('classIds.*').optional().isMongoId().withMessage('Invalid class selected'),
    body('noticeType').optional().isIn(['General', 'Payment']).withMessage('Notice type must be General or Payment'),
    body('amount').optional().isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
    body('dueDate').optional({ nullable: true }).isISO8601().withMessage('Due date is invalid'),
    body('isImportant').optional().isBoolean().withMessage('isImportant must be true or false'),
    body('status').optional().isIn(['Active', 'Expired']).withMessage('Status must be Active or Expired')
  ],
  validate,
  noticeController.updateNotice
);

router.patch(
  '/expire/:id',
  protect,
  requireRole(['admin']),
  [param('id').isMongoId().withMessage('Notice is invalid')],
  validate,
  noticeController.expireNotice
);

router.delete(
  '/:id',
  protect,
  requireRole(['admin']),
  [param('id').isMongoId().withMessage('Notice is invalid')],
  validate,
  noticeController.deleteNotice
);

module.exports = router;
