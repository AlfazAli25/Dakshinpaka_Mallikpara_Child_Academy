const express = require('express');
const { body, param } = require('express-validator');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/student.controller');
const validate = require('../middleware/validate.middleware');

const router = express.Router();

router.get('/', protect, controller.list);
router.get('/me/profile', protect, requireRole(['student']), controller.getMyProfile);
router.get('/admin/all', protect, requireRole(['admin']), controller.listAllForAdmin);
router.get(
	'/class/:classId',
	protect,
	requireRole(['admin', 'teacher']),
	[param('classId').isMongoId().withMessage('Invalid class selected')],
	validate,
	controller.listByClass
);
router.get('/by-user/:userId/profile', protect, requireRole(['admin']), controller.getAdminProfileByUserId);
router.delete('/by-user/:userId', protect, requireRole(['admin']), controller.removeByUserId);
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
		body('admissionNo').notEmpty().withMessage('Admission number is required'),
		body('classId').notEmpty().withMessage('Class is required').bail().isMongoId().withMessage('Invalid class selected'),
		body('gender').isIn(['MALE', 'FEMALE', 'OTHER']).withMessage('Gender must be MALE, FEMALE, or OTHER'),
		body('dob').isISO8601().withMessage('Please enter a valid date of birth'),
		body('guardianContact').notEmpty().withMessage('Guardian contact is required'),
		body('address').notEmpty().withMessage('Address is required'),
		body('pendingFees').optional().isFloat({ min: 0 }).withMessage('Pending fees must be 0 or greater'),
		body('attendance').isFloat({ min: 0, max: 100 }).withMessage('Attendance must be between 0 and 100')
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
		body('admissionNo').optional().notEmpty().withMessage('Admission number is required'),
		body('classId').optional().isMongoId().withMessage('Invalid class selected'),
		body('gender').optional().isIn(['MALE', 'FEMALE', 'OTHER']).withMessage('Gender must be MALE, FEMALE, or OTHER'),
		body('dob').optional().isISO8601().withMessage('Please enter a valid date of birth'),
		body('guardianContact').optional().notEmpty().withMessage('Guardian contact is required'),
		body('address').optional().notEmpty().withMessage('Address is required'),
		body('pendingFees').optional().isFloat({ min: 0 }).withMessage('Pending fees must be 0 or greater')
	],
	validate,
	controller.update
);
router.delete('/:id', protect, requireRole(['admin']), controller.remove);

module.exports = router;