const Payroll = require('../models/payroll.model');
const Teacher = require('../models/teacher.model');
const createCrudService = require('./crud.service');
const { createSalaryReceipt } = require('./receipt.service');
const { createActionLog } = require('./action-log.service');
const {
	ensureMonthlyPayrollForTeacher,
	ensureMonthlyPayrollForAllTeachers,
	normalizeMonthKey,
	getMonthDateFromKey,
	getMonthKey
} = require('./monthly-payroll-ledger.service');

const base = createCrudService(Payroll);

const roundAmount = (value) => {
	const numeric = Number(value || 0);
	if (!Number.isFinite(numeric)) {
		return 0;
	}

	return Number(numeric.toFixed(2));
};

const findAll = async (filter = {}) => {
	if (filter?.teacherId) {
		await ensureMonthlyPayrollForTeacher({ teacherId: filter.teacherId });
	} else {
		await ensureMonthlyPayrollForAllTeachers();
	}

	return base.findAll(filter, 'staffId teacherId processedByAdmin receiptId');
};
const findById = (id) => base.findById(id, 'staffId teacherId processedByAdmin receiptId');

const normalizeMonth = (month) => {
	const normalizedMonth = normalizeMonthKey(month);
	if (normalizedMonth) {
		return normalizedMonth;
	}

	return getMonthKey(new Date());
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
	await ensureMonthlyPayrollForTeacher({
		teacherId: teacher._id,
		anchorDate: getMonthDateFromKey(payrollMonth) || new Date(),
		monthlyAmount: teacher.monthlySalary
	});

	let payroll = await Payroll.findOne({ teacherId: teacher._id, month: payrollMonth });
	const normalizedPendingSalaryCleared =
		pendingSalaryCleared !== undefined ? Number(pendingSalaryCleared) : normalizedAmount;

	if (!Number.isFinite(normalizedPendingSalaryCleared) || normalizedPendingSalaryCleared < 0) {
		const error = new Error('Pending salary cleared must be 0 or more');
		error.statusCode = 400;
		throw error;
	}

	if (!payroll) {
		payroll = await Payroll.create({
			teacherId: teacher._id,
			month: payrollMonth,
			amount: 0,
			status: 'Pending'
		});
	}

	const isFirstPaymentForPendingMonth = payroll.status !== 'Paid' && !payroll.paidOn;
	if (isFirstPaymentForPendingMonth) {
		payroll.amount = roundAmount(normalizedAmount);
		payroll.pendingSalaryCleared = roundAmount(normalizedPendingSalaryCleared);
	} else {
		payroll.amount = roundAmount(Number(payroll.amount || 0) + normalizedAmount);
		payroll.pendingSalaryCleared = roundAmount(
			Number(payroll.pendingSalaryCleared || 0) + normalizedPendingSalaryCleared
		);
	}

	payroll.status = 'Paid';
	payroll.paidOn = new Date();
	payroll.paymentMethod = paymentMethod || payroll.paymentMethod || 'BANK_TRANSFER';
	payroll.processedByAdmin = adminUserId;

	const receipt = await createSalaryReceipt({
		teacher,
		payroll,
		amount: payroll.amount,
		paymentMethod: payroll.paymentMethod,
		generatedBy: adminUserId,
		pendingSalaryCleared: payroll.pendingSalaryCleared
	});

	payroll.receiptId = receipt._id;
	await payroll.save();

	teacher.pendingSalary = Math.max(
		roundAmount(Number(teacher.pendingSalary || 0) - normalizedPendingSalaryCleared),
		0
	);
	await teacher.save();

	await createActionLog({
		actorId: adminUserId,
		action: 'TEACHER_SALARY_PAID',
		module: 'PAYROLL',
		entityId: String(payroll._id),
		metadata: {
			teacherId: String(teacher._id),
			month: payrollMonth,
			amount: normalizedAmount,
			totalPaidForMonth: payroll.amount,
			receiptNumber: receipt.receiptNumber
		}
	});

	return Payroll.findById(payroll._id).populate('teacherId processedByAdmin receiptId');
};

const getTeacherSalaryHistoryForAdmin = async ({ teacherId }) => {
	await ensureMonthlyPayrollForTeacher({ teacherId });
	return Payroll.find({ teacherId }).populate('teacherId processedByAdmin receiptId').sort({ month: -1, createdAt: -1 });
};

const getTeacherSalaryHistoryByUser = async ({ userId }) => {
	const teacher = await Teacher.findOne({ userId });
	if (!teacher) {
		const error = new Error('Teacher record not found');
		error.statusCode = 404;
		throw error;
	}

	await ensureMonthlyPayrollForTeacher({ teacherId: teacher._id });

	return Payroll.find({ teacherId: teacher._id })
		.populate('teacherId processedByAdmin receiptId')
		.sort({ month: -1, createdAt: -1 });
};

module.exports = {
	...base,
	findAll,
	findById,
	payTeacherSalaryByAdmin,
	getTeacherSalaryHistoryForAdmin,
	getTeacherSalaryHistoryByUser
};