const express = require('express');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/timetable.controller');

const router = express.Router();

router.post('/', protect, requireRole(['admin']), controller.createTimetable);
router.get('/class/:classId', protect, requireRole(['admin', 'teacher', 'student']), controller.getTimetableByClass);
router.get('/teacher/:teacherId', protect, requireRole(['admin', 'teacher']), controller.getTimetableByTeacher);
router.get('/me', protect, requireRole(['teacher']), controller.getMyTimetable);
router.put('/:id', protect, requireRole(['admin']), controller.updateTimetable);
router.delete('/:id', protect, requireRole(['admin']), controller.deleteTimetable);

// Legacy compatibility for previous client route shape.
router.get('/:classId', protect, requireRole(['admin', 'teacher', 'student']), controller.getTimetableByClass);

module.exports = router;