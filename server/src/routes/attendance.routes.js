const express = require('express');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/attendance.controller');

const router = express.Router();

router.get('/', protect, requireRole(['admin', 'teacher', 'student']), controller.list);
router.post('/', protect, requireRole(['admin', 'teacher']), controller.create);
router.put('/:id', protect, requireRole(['admin', 'teacher']), controller.update);

module.exports = router;