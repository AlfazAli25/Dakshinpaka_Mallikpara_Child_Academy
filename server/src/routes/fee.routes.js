const express = require('express');
const { body } = require('express-validator');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/fee.controller');
const validate = require('../middleware/validate.middleware');
const { screenshotUpload } = require('../middleware/upload.middleware');

const router = express.Router();

router.get('/', protect, requireRole(['admin', 'student']), controller.list);
router.get('/pending-verifications', protect, requireRole(['admin']), controller.listPendingVerifications);
router.get('/student/:studentId/payments', protect, requireRole(['admin']), controller.getStudentPayments);
router.get('/my/payments', protect, requireRole(['student']), controller.getMyPayments);
router.get('/payments/:transactionId', protect, requireRole(['student']), controller.getPaymentStatus);
router.get('/payments/:paymentId/screenshot', protect, requireRole(['admin']), controller.getPaymentScreenshot);
router.post(
	'/payments/:paymentId/verify',
	protect,
	requireRole(['admin']),
	[
		body('decision').isIn(['APPROVE', 'REJECT']).withMessage('Decision must be APPROVE or REJECT'),
		body('notes').optional().isString().isLength({ max: 500 }).withMessage('Notes must be under 500 characters'),
		body('transactionReference').optional().isString().isLength({ max: 120 })
	],
	validate,
	controller.verifyStaticQrPayment
);
router.get('/:id', protect, controller.get);
router.post(
	'/:id/pay-cash',
	protect,
	requireRole(['admin']),
	[body('amount').optional().isFloat({ gt: 0 }).withMessage('Amount must be greater than 0')],
	validate,
	controller.payCash
);
router.post(
	'/:id/pay-online',
	protect,
	requireRole(['admin']),
	[
		body('amount').optional().isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
		body('transactionReference').optional().isString().isLength({ max: 120 })
	],
	validate,
	controller.payOnline
);
router.post(
	'/:id/upload-static-qr-screenshot',
	protect,
	requireRole(['student']),
	screenshotUpload.single('screenshot'),
	[body('amount').optional().isFloat({ gt: 0 }).withMessage('Amount must be greater than 0')],
	validate,
	controller.uploadStaticQrScreenshot
);
router.post('/', protect, requireRole(['admin']), controller.create);
router.put('/:id', protect, requireRole(['admin']), controller.update);
router.delete('/:id', protect, requireRole(['admin']), controller.remove);

module.exports = router;