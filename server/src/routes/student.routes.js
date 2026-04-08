const express = require('express');
const { body, param } = require('express-validator');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/student.controller');
const validate = require('../middleware/validate.middleware');
const { profilePhotoUpload } = require('../middleware/upload.middleware');

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
	profilePhotoUpload.single('studentPhoto'),
	[
		body('name').notEmpty().withMessage('Name is required'),
		body('email').optional({ checkFalsy: true }).isEmail().withMessage('Please enter a valid email address.'),
		body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
		body('classId').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid class selected'),
		body('rollNo').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Roll number must be a positive whole number'),
		body('gender').optional({ checkFalsy: true }).isIn(['MALE', 'FEMALE', 'OTHER']).withMessage('Gender must be MALE, FEMALE, or OTHER'),
		body('dob').optional({ checkFalsy: true }).isISO8601().withMessage('Please enter a valid date of birth'),
		body('guardianContact').notEmpty().withMessage('Guardian contact is required'),
		body('address').optional({ checkFalsy: true }).notEmpty().withMessage('Address is required'),
		body('pendingFees').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Pending fees must be 0 or greater'),
		body('attendance').optional({ checkFalsy: true }).isFloat({ min: 0, max: 100 }).withMessage('Attendance must be between 0 and 100')
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
		body('rollNo').optional().isInt({ min: 1 }).withMessage('Roll number must be a positive whole number'),
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