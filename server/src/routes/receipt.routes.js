const express = require('express');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/receipt.controller');

const router = express.Router();

router.get('/download/:paymentId', protect, requireRole(['admin', 'student']), controller.downloadPaymentReceipt);

module.exports = router;
