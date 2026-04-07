const express = require('express');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/receipt.controller');

const router = express.Router();

router.get('/download/:paymentId', protect, requireRole(['admin', 'student']), controller.downloadPaymentReceipt);
router.get('/student/:paymentId', protect, requireRole(['admin', 'student']), controller.downloadPaymentReceipt);
router.get('/notice/:noticePaymentId', protect, requireRole(['admin', 'student']), controller.downloadNoticePaymentReceipt);
router.get('/download/notice/:noticePaymentId', protect, requireRole(['admin', 'student']), controller.downloadNoticePaymentReceipt);
router.get('/teacher/:payrollId', protect, requireRole(['admin', 'teacher']), controller.downloadTeacherSalaryReceipt);
router.get('/download/teacher/:payrollId', protect, requireRole(['admin', 'teacher']), controller.downloadTeacherSalaryReceipt);

module.exports = router;
