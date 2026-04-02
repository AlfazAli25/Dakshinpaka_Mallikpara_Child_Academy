const express = require('express');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/student-panel.controller');

const router = express.Router();

router.get('/profile', protect, requireRole(['student']), controller.getProfile);
router.get('/fees', protect, requireRole(['student']), controller.getFees);
router.get('/attendance', protect, requireRole(['student']), controller.getAttendance);
router.get('/results', protect, requireRole(['student']), controller.getResults);

module.exports = router;
