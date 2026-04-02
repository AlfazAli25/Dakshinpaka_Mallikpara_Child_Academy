const express = require('express');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/receipt.controller');

const router = express.Router();

router.get('/student', protect, requireRole(['student']), controller.listStudentReceipts);
router.get('/teacher', protect, requireRole(['teacher']), controller.listTeacherReceipts);

module.exports = router;
