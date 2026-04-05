const express = require('express');
const { param, query } = require('express-validator');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/attendance.controller');
const validate = require('../middleware/validate.middleware');

const router = express.Router();

router.post('/', protect, requireRole(['teacher']), controller.markAttendance);
router.get(
	'/',
	protect,
	requireRole(['admin', 'teacher', 'student']),
	[
		query('classId').optional().isMongoId().withMessage('Invalid class selected'),
		query('date').optional().isISO8601().withMessage('Invalid attendance date')
	],
	validate,
	controller.getAttendanceByClassAndDate
);
router.put(
	'/:id',
	protect,
	requireRole(['teacher']),
	[param('id').isMongoId().withMessage('Invalid attendance id')],
	validate,
	controller.updateAttendance
);
router.delete(
	'/:id',
	protect,
	requireRole(['admin']),
	[param('id').isMongoId().withMessage('Invalid attendance id')],
	validate,
	controller.deleteAttendance
);

module.exports = router;