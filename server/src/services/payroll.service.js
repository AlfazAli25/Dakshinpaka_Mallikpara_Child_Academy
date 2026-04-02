const Payroll = require('../models/payroll.model');
const Teacher = require('../models/teacher.model');
const createCrudService = require('./crud.service');
const { createSalaryReceipt } = require('./receipt.service');
const { createActionLog } = require('./action-log.service');

const base = createCrudService(Payroll);

const findAll = (filter = {}) => base.findAll(filter, 'staffId teacherId processedByAdmin receiptId');
const findById = (id) => base.findById(id, 'staffId teacherId processedByAdmin receiptId');

const normalizeMonth = (month) => {
	if (month && String(month).trim()) {
		return String(month).trim();
	}

	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const payTeacherSalaryByAdmin = async ({ teacherId, amount, month, paymentMethod, adminUserId, pendingSalaryCleared }) => {
	const teacher = await Teacher.findById(teacherId).populate('userId');
	if (!teacher) {
		const error = new Error('Teacher record not found');
		error.statusCode = 404;
		throw error;
	}

	const normalizedAmount = Number(amount);
	if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
		const error = new Error('Amount must be greater than zero');
		error.statusCode = 400;
		throw error;
	}

	const payrollMonth = normalizeMonth(month);
	let payroll = await Payroll.findOne({ teacherId: teacher._id, month: payrollMonth });

	if (payroll?.status === 'Paid') {
		const error = new Error('Salary for this teacher and month is already marked as paid');
		error.statusCode = 409;
		throw error;
	}

	if (!payroll) {
		payroll = await Payroll.create({
			teacherId: teacher._id,
			month: payrollMonth,
			amount: normalizedAmount,
			status: 'Pending'
		});
	}

	payroll.amount = normalizedAmount;
	payroll.status = 'Paid';
	payroll.paidOn = new Date();
	payroll.paymentMethod = paymentMethod || 'BANK_TRANSFER';
	payroll.processedByAdmin = adminUserId;
	payroll.pendingSalaryCleared = Math.max(Number(pendingSalaryCleared || normalizedAmount), 0);

	const receipt = await createSalaryReceipt({
		teacher,
		payroll,
		amount: normalizedAmount,
		paymentMethod: payroll.paymentMethod,
		generatedBy: adminUserId,
		pendingSalaryCleared: payroll.pendingSalaryCleared
	});

	payroll.receiptId = receipt._id;
	await payroll.save();

	await createActionLog({
		actorId: adminUserId,
		action: 'TEACHER_SALARY_PAID',
		module: 'PAYROLL',
		entityId: String(payroll._id),
		metadata: {
			teacherId: String(teacher._id),
			month: payrollMonth,
			amount: normalizedAmount,
			receiptNumber: receipt.receiptNumber
		}
	});

	return Payroll.findById(payroll._id).populate('teacherId processedByAdmin receiptId');
};

const getTeacherSalaryHistoryForAdmin = async ({ teacherId }) =>
	Payroll.find({ teacherId }).populate('teacherId processedByAdmin receiptId').sort({ createdAt: -1 });

const getTeacherSalaryHistoryByUser = async ({ userId }) => {
	const teacher = await Teacher.findOne({ userId });
	if (!teacher) {
		const error = new Error('Teacher record not found');
		error.statusCode = 404;
		throw error;
	}

	return Payroll.find({ teacherId: teacher._id }).populate('teacherId processedByAdmin receiptId').sort({ createdAt: -1 });
};

module.exports = {
	...base,
	findAll,
	findById,
	payTeacherSalaryByAdmin,
	getTeacherSalaryHistoryForAdmin,
	getTeacherSalaryHistoryByUser
};