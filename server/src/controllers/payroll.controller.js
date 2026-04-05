const createCrudController = require('./crud.controller.factory');
const asyncHandler = require('../middleware/async.middleware');
const payrollService = require('../services/payroll.service');

const base = createCrudController(payrollService, 'Payroll');

const payTeacherSalary = asyncHandler(async (req, res) => {
	const paymentResult = await payrollService.payTeacherSalaryByAdmin({
		teacherId: req.params.teacherId,
		amount: req.body?.amount,
		month: req.body?.month,
		paymentMethod: req.body?.paymentMethod,
		adminUserId: req.user._id
	});

	res.status(201).json({
		success: true,
		message: 'Teacher salary marked as paid and receipt generated',
		data: paymentResult?.payroll,
		summary: {
			amountApplied: paymentResult?.amountApplied || 0,
			totalPendingBefore: paymentResult?.totalPendingBefore || 0,
			totalPendingAfter: paymentResult?.totalPendingAfter || 0,
			allocations: paymentResult?.allocations || []
		}
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