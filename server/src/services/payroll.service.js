const Payroll = require('../models/payroll.model');
const Teacher = require('../models/teacher.model');
const Notification = require('../models/notification.model');
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

const getPendingPayrollRowsForTeacher = async ({ teacherId }) => {
	const payrollRows = await Payroll.find({ teacherId, status: 'Pending' }).sort({ month: 1, createdAt: 1 });
	const pendingRows = payrollRows
		.map((payroll) => ({
			payroll,
			pendingAmount: roundAmount(Math.max(Number(payroll.amount || 0), 0))
		}))
		.filter((item) => item.pendingAmount > 0);

	const totalPendingAmount = roundAmount(
		pendingRows.reduce((sum, item) => sum + item.pendingAmount, 0)
	);

	return {
		pendingRows,
		totalPendingAmount
	};
};

const finalizeTeacherSalaryPaymentByAdmin = async ({ teacherId, amount, month, paymentMethod, adminUserId }) => {
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

	const payrollMonth = month ? normalizeMonth(month) : '';
	await ensureMonthlyPayrollForTeacher({
		teacherId: teacher._id,
		anchorDate: (payrollMonth ? getMonthDateFromKey(payrollMonth) : null) || new Date(),
		monthlyAmount: teacher.monthlySalary
	});

	const { pendingRows, totalPendingAmount } = await getPendingPayrollRowsForTeacher({
		teacherId: teacher._id
	});

	if (pendingRows.length === 0 || totalPendingAmount <= 0) {
		const error = new Error('No pending monthly salary found for this teacher');
		error.statusCode = 400;
		throw error;
	}

	if (normalizedAmount > totalPendingAmount) {
		const error = new Error(`Amount cannot exceed pending salary (INR ${totalPendingAmount})`);
		error.statusCode = 400;
		throw error;
	}

	let remainingAmount = roundAmount(normalizedAmount);
	const normalizedPaymentMethod = paymentMethod || 'Via Online';
	const paymentTimestamp = new Date();
	const affectedPayrollRows = [];
	const allocations = [];

	for (const row of pendingRows) {
		if (remainingAmount <= 0) {
			break;
		}

		const payroll = row.payroll;
		const pendingBefore = row.pendingAmount;
		const payAmount = roundAmount(Math.min(remainingAmount, pendingBefore));
		if (payAmount <= 0) {
			continue;
		}

		const clearedBefore = roundAmount(Number(payroll.pendingSalaryCleared || 0));
		const pendingAfter = roundAmount(Math.max(pendingBefore - payAmount, 0));
		const clearedAfter = roundAmount(clearedBefore + payAmount);

		payroll.pendingSalaryCleared = clearedAfter;
		payroll.paymentMethod = normalizedPaymentMethod;
		payroll.processedByAdmin = adminUserId;
		payroll.paidOn = paymentTimestamp;

		if (pendingAfter <= 0) {
			payroll.status = 'Paid';
			payroll.amount = clearedAfter > 0 ? clearedAfter : pendingBefore;
		} else {
			payroll.status = 'Pending';
			payroll.amount = pendingAfter;
		}

		await payroll.save();

		affectedPayrollRows.push(payroll);
		allocations.push({
			payrollId: String(payroll._id),
			month: payroll.month,
			amount: payAmount
		});
		remainingAmount = roundAmount(remainingAmount - payAmount);
	}

	const totalAllocatedAmount = roundAmount(normalizedAmount - remainingAmount);
	if (totalAllocatedAmount <= 0 || affectedPayrollRows.length === 0) {
		const error = new Error('Unable to allocate salary payment to pending salary');
		error.statusCode = 400;
		throw error;
	}

	const normalizedAmountPaid = roundAmount(totalAllocatedAmount);

	const primaryPayroll = affectedPayrollRows[0];

	const remainingPendingRows = await Payroll.find({ teacherId: teacher._id, status: 'Pending' }).select('amount');
	const remainingPendingSalary = roundAmount(
		remainingPendingRows.reduce((sum, payroll) => sum + Math.max(Number(payroll.amount || 0), 0), 0)
	);
	teacher.pendingSalary = remainingPendingSalary;
	await teacher.save();

	const receipt = await createSalaryReceipt({
		teacher,
		payroll: {
			_id: primaryPayroll._id,
			paidOn: paymentTimestamp,
			receiptId: undefined
		},
		amount: normalizedAmountPaid,
		amountPaid: normalizedAmountPaid,
		monthlySalary: roundAmount(Number(teacher.monthlySalary || 0)),
		pendingSalary: remainingPendingSalary,
		paymentMethod: normalizedPaymentMethod,
		generatedBy: adminUserId,
		pendingSalaryCleared: normalizedAmountPaid
	});

	for (const payroll of affectedPayrollRows) {
		if (payroll.receiptId) {
			continue;
		}

		payroll.receiptId = receipt._id;
		await payroll.save();
	}

	await createActionLog({
		actorId: adminUserId,
		action: 'TEACHER_SALARY_PAID',
		module: 'PAYROLL',
		entityId: String(primaryPayroll._id),
		metadata: {
			teacherId: String(teacher._id),
			month: payrollMonth || undefined,
			amount: normalizedAmountPaid,
			totalPendingBefore: totalPendingAmount,
			totalPendingAfter: remainingPendingSalary,
			allocations,
			receiptNumber: receipt.receiptNumber
		}
	});

	const payroll = await Payroll.findById(primaryPayroll._id).populate('teacherId processedByAdmin receiptId');

	return {
		payroll,
		receipt,
		allocations,
		totalPendingBefore: totalPendingAmount,
		totalPendingAfter: remainingPendingSalary,
		amountApplied: normalizedAmountPaid
	};
};

const payTeacherSalaryByAdmin = async ({ teacherId, amount, month, paymentMethod, adminUserId }) => {
	const teacher = await Teacher.findById(teacherId).populate('userId');
	if (!teacher) {
		const error = new Error('Teacher record not found');
		error.statusCode = 404;
		throw error;
	}

	const normalizedAmount = roundAmount(amount);
	if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
		const error = new Error('Amount must be greater than zero');
		error.statusCode = 400;
		throw error;
	}

	const payrollMonth = month ? normalizeMonth(month) : '';
	await ensureMonthlyPayrollForTeacher({
		teacherId: teacher._id,
		anchorDate: (payrollMonth ? getMonthDateFromKey(payrollMonth) : null) || new Date(),
		monthlyAmount: teacher.monthlySalary
	});

	const { totalPendingAmount } = await getPendingPayrollRowsForTeacher({ teacherId: teacher._id });
	if (totalPendingAmount <= 0) {
		const error = new Error('No pending monthly salary found for this teacher');
		error.statusCode = 400;
		throw error;
	}

	if (normalizedAmount > totalPendingAmount) {
		const error = new Error(`Amount cannot exceed pending salary (INR ${totalPendingAmount})`);
		error.statusCode = 400;
		throw error;
	}

	const normalizedPaymentMethod = String(paymentMethod || 'Via Online').trim() || 'Via Online';
	const pendingConfirmation = await Notification.findOne({
		recipientRole: 'teacher',
		notificationType: 'TEACHER_SALARY_PAYMENT_CONFIRMATION',
		teacherId: teacher._id,
		'metadata.status': 'PENDING'
	}).select('_id');

	if (pendingConfirmation) {
		const error = new Error('A salary confirmation request is already pending for this teacher');
		error.statusCode = 409;
		throw error;
	}

	const teacherName = String(teacher?.userId?.name || teacher?.teacherId || 'Teacher').trim();
	const now = new Date();
	const notification = await Notification.create({
		recipientRole: 'teacher',
		notificationType: 'TEACHER_SALARY_PAYMENT_CONFIRMATION',
		teacherId: teacher._id,
		teacherName,
		adminId: adminUserId,
		title: 'Salary payment confirmation',
		message: `Admin paid you INR ${normalizedAmount}. Did you get the amount?`,
		targetPath: '/teacher/dashboard',
		submittedAt: now,
		status: 'UNREAD',
		metadata: {
			status: 'PENDING',
			amount: normalizedAmount,
			paymentMethod: normalizedPaymentMethod,
			month: payrollMonth || '',
			requestedAt: now.toISOString()
		}
	});

	await createActionLog({
		actorId: adminUserId,
		action: 'TEACHER_SALARY_PAYMENT_CONFIRMATION_REQUESTED',
		module: 'PAYROLL',
		entityId: String(notification._id),
		metadata: {
			teacherId: String(teacher._id),
			amount: normalizedAmount,
			paymentMethod: normalizedPaymentMethod,
			month: payrollMonth || undefined
		}
	});

	return {
		confirmationRequested: true,
		notificationId: String(notification._id),
		teacherId: String(teacher._id),
		teacherName,
		amountRequested: normalizedAmount,
		totalPendingBefore: totalPendingAmount,
		paymentMethod: normalizedPaymentMethod,
		month: payrollMonth || undefined
	};
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
	finalizeTeacherSalaryPaymentByAdmin,
	getTeacherSalaryHistoryForAdmin,
	getTeacherSalaryHistoryByUser
};