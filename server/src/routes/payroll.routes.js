const express = require('express');
const { body } = require('express-validator');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/payroll.controller');
const validate = require('../middleware/validate.middleware');

const router = express.Router();

router.get('/my/history', protect, requireRole(['teacher']), controller.getMySalaryHistory);
router.get('/teacher/:teacherId/history', protect, requireRole(['admin']), controller.getTeacherSalaryHistory);
router.post(
	'/teacher/:teacherId/pay',
	protect,
	requireRole(['admin']),
	[
		body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than zero'),
		body('month').optional().isString().isLength({ min: 4, max: 20 }).withMessage('Invalid month format'),
		body('paymentMethod').optional().isString().isLength({ max: 50 }),
		body('pendingSalaryCleared').optional().isFloat({ min: 0 }).withMessage('Pending salary cleared must be 0 or more')
	],
	validate,
	controller.payTeacherSalary
);
router.get('/', protect, requireRole(['admin']), controller.list);
router.get('/:id', protect, requireRole(['admin']), controller.get);
router.post('/', protect, requireRole(['admin']), controller.create);
router.put('/:id', protect, requireRole(['admin']), controller.update);
router.delete('/:id', protect, requireRole(['admin']), controller.remove);

module.exports = router;