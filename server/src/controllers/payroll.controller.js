const createCrudController = require('./crud.controller.factory');
const asyncHandler = require('../middleware/async.middleware');
const payrollService = require('../services/payroll.service');

const base = createCrudController(payrollService, 'Payroll');

const payTeacherSalary = asyncHandler(async (req, res) => {
	const paymentRequest = await payrollService.payTeacherSalaryByAdmin({
		teacherId: req.params.teacherId,
		amount: req.body?.amount,
		month: req.body?.month,
		paymentMethod: req.body?.paymentMethod,
		adminUserId: req.user._id
	});

	res.status(201).json({
		success: true,
		message: 'Salary payment request sent to teacher for confirmation',
		data: paymentRequest
	});
});

const getTeacherSalaryHistory = asyncHandler(async (req, res) => {
	const history = await payrollService.getTeacherSalaryHistoryForAdmin({ teacherId: req.params.teacherId });
	res.json({ success: true, data: history });
});

const getMySalaryHistory = asyncHandler(async (req, res) => {
	const history = await payrollService.getTeacherSalaryHistoryByUser({ userId: req.user._id });
	res.json({ success: true, data: history });
});

module.exports = { ...base, payTeacherSalary, getTeacherSalaryHistory, getMySalaryHistory };