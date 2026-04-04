const express = require('express');
const { body } = require('express-validator');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/teacher.controller');
const validate = require('../middleware/validate.middleware');

const router = express.Router();

router.get('/', protect, controller.list);
router.get('/me/profile', protect, requireRole(['teacher']), controller.getMyProfile);
router.get('/:id/profile', protect, requireRole(['admin']), controller.getAdminProfile);
router.get('/:id', protect, requireRole(['admin']), controller.get);
router.post(
	'/',
	protect,
	requireRole(['admin']),
	[
		body('name').notEmpty().withMessage('Name is required'),
		body('email').isEmail().withMessage('Please enter a valid email address.'),
		body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
		body('teacherId').notEmpty().withMessage('Teacher ID is required'),
		body('contactNumber').matches(/^\d{7,15}$/).withMessage('Contact number must contain only digits (7 to 15 digits)'),
		body('department').notEmpty().withMessage('Department is required'),
		body('qualifications').notEmpty().withMessage('Qualifications are required'),
		body('joiningDate').isISO8601().withMessage('Please enter a valid joining date'),
		body('classIds').isArray({ min: 1 }).withMessage('Select at least one class'),
		body('classIds.*').isMongoId().withMessage('Invalid class selected'),
		body('subjects').isArray({ min: 1 }).withMessage('Select at least one subject'),
		body('subjects.*').isMongoId().withMessage('Invalid subject selected')
	],
	validate,
	controller.create
);
router.put(
	'/:id',
	protect,
	requireRole(['admin']),
	[
		body('name').optional().notEmpty().withMessage('Name cannot be empty'),
		body('email').optional().isEmail().withMessage('Please enter a valid email address.'),
		body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
		body('teacherId').optional().notEmpty().withMessage('Teacher ID is required'),
		body('contactNumber').optional().matches(/^\d{7,15}$/).withMessage('Contact number must contain only digits (7 to 15 digits)'),
		body('department').optional().notEmpty().withMessage('Department is required'),
		body('qualifications').optional().notEmpty().withMessage('Qualifications are required'),
		body('joiningDate').optional().isISO8601().withMessage('Please enter a valid joining date'),
		body('classIds').optional().isArray({ min: 1 }).withMessage('Select at least one class'),
		body('classIds.*').optional().isMongoId().withMessage('Invalid class selected'),
		body('subjects').optional().isArray({ min: 1 }).withMessage('Select at least one subject'),
		body('subjects.*').optional().isMongoId().withMessage('Invalid subject selected')
	],
	validate,
	controller.update
);
router.delete('/:id', protect, requireRole(['admin']), controller.remove);

module.exports = router;