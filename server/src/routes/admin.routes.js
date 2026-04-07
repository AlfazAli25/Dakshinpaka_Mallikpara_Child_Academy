const express = require('express');
const { body } = require('express-validator');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/admin.controller');
const validate = require('../middleware/validate.middleware');

const router = express.Router();

router.post(
	'/register-student',
	protect,
	requireRole(['admin']),
	[
		body('name').notEmpty().withMessage('Name is required'),
		body('email').isEmail().withMessage('Please enter a valid email address.'),
		body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
		body('classId').notEmpty().withMessage('Class is required').bail().isMongoId().withMessage('Invalid class selected'),
		body('rollNo').isInt({ min: 1 }).withMessage('Roll number must be a positive whole number'),
		body('gender').isIn(['MALE', 'FEMALE', 'OTHER']).withMessage('Gender must be MALE, FEMALE, or OTHER'),
		body('dob').isISO8601().withMessage('Please enter a valid date of birth'),
		body('guardianContact').notEmpty().withMessage('Guardian contact is required'),
		body('address').notEmpty().withMessage('Address is required'),
		body('pendingFees').optional().isFloat({ min: 0 }).withMessage('Pending fees must be 0 or greater'),
		body('attendance').isFloat({ min: 0, max: 100 }).withMessage('Attendance must be between 0 and 100')
	],
	validate,
	controller.registerStudent
);

router.post(
	'/register-teacher',
	protect,
	requireRole(['admin']),
	[
		body('name').notEmpty().withMessage('Name is required'),
		body('email').isEmail().withMessage('Please enter a valid email address.'),
		body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
		body('teacherId').notEmpty().withMessage('Teacher ID is required'),
		body('department').notEmpty().withMessage('Department is required'),
		body('qualifications').notEmpty().withMessage('Qualifications are required'),
		body('joiningDate').isISO8601().withMessage('Please enter a valid joining date'),
		body('subjects').isArray({ min: 1 }).withMessage('Select at least one subject'),
		body('subjects.*').isMongoId().withMessage('Invalid subject selected')
	],
	validate,
	controller.registerTeacher
);

module.exports = router;
