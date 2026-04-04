const Payroll = require('../models/payroll.model');
const Teacher = require('../models/teacher.model');

const EPSILON = 0.0001;

const withSession = (query, session) => (session ? query.session(session) : query);

const getMonthStartDate = (value = new Date()) => {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
	}

	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

const addMonths = (date, monthCount) =>
	new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthCount, 1));

const getMonthKey = (value = new Date()) => {
	const date = getMonthStartDate(value);
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	return `${date.getUTCFullYear()}-${month}`;
};

const normalizeMonthKey = (month) => {
	const normalized = String(month || '').trim();
	const match = normalized.match(/^(\d{4})-(\d{1,2})$/);
	if (!match) {
		return '';
	}

	const year = Number(match[1]);
	const monthNumber = Number(match[2]);
	if (!Number.isFinite(year) || !Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) {
		return '';
	}

	return `${year}-${String(monthNumber).padStart(2, '0')}`;
};

const getMonthDateFromKey = (monthKey) => {
	const normalizedKey = normalizeMonthKey(monthKey);
	if (!normalizedKey) {
		return null;
	}

	const [year, month] = normalizedKey.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, 1));
};

const toAmount = (value) => {
	const numeric = Number(value || 0);
	if (!Number.isFinite(numeric)) {
		return 0;
	}

	return Math.round(numeric * 100) / 100;
};

const areAmountsEqual = (left, right) => Math.abs(toAmount(left) - toAmount(right)) <= EPSILON;

const calculatePendingSalaryAmount = (payroll) =>
	payroll?.status === 'Pending' ? toAmount(Math.max(Number(payroll.amount || 0), 0)) : 0;

const getTeacherPayrollStartMonth = (teacher) => {
	const sourceDate = teacher?.joiningDate || teacher?.createdAt || new Date();
	return getMonthStartDate(sourceDate);
};

const listMonthStartsInRange = ({ fromDate, toDate }) => {
	const start = getMonthStartDate(fromDate);
	const end = getMonthStartDate(toDate);
	if (start > end) {
		return [];
	}

	const months = [];
	let cursor = start;
	while (cursor <= end) {
		months.push(cursor);
		cursor = addMonths(cursor, 1);
	}

	return months;
};

const listTrailingMonthStarts = ({ monthCount, anchorDate = new Date() }) => {
	const normalizedMonthCount = Number(monthCount || 0);
	if (!Number.isInteger(normalizedMonthCount) || normalizedMonthCount <= 0) {
		return [];
	}

	const targetMonth = getMonthStartDate(anchorDate);
	const oldestMonth = addMonths(targetMonth, -(normalizedMonthCount - 1));
	return listMonthStartsInRange({ fromDate: oldestMonth, toDate: targetMonth });
};

const splitIntoMonthlyChunks = (amount, monthlyAmount) => {
	let remaining = toAmount(Math.max(amount, 0));
	const chunks = [];

	while (remaining > EPSILON) {
		const chunk = toAmount(Math.min(monthlyAmount, remaining));
		chunks.push(chunk);
		remaining = toAmount(remaining - chunk);
	}

	return chunks;
};

const normalizePayrollRow = async ({ payroll, session }) => {
	const normalizedMonth = normalizeMonthKey(payroll.month) || getMonthKey(payroll.paidOn || payroll.createdAt || new Date());
	const normalizedAmount = toAmount(Math.max(Number(payroll.amount || 0), 0));
	const normalizedStatus = payroll.status === 'Paid' ? 'Paid' : 'Pending';

	const shouldUpdate =
		payroll.month !== normalizedMonth ||
		Math.abs(Number(payroll.amount || 0) - normalizedAmount) > EPSILON ||
		payroll.status !== normalizedStatus;

	if (!shouldUpdate) {
		return payroll;
	}

	payroll.month = normalizedMonth;
	payroll.amount = normalizedAmount;
	payroll.status = normalizedStatus;
	await payroll.save({ session });
	return payroll;
};

const inferMonthlySalaryAmount = (payrollRows = []) => {
	const sortedRows = [...payrollRows].sort((left, right) => String(right.month || '').localeCompare(String(left.month || '')));
	const latestPaidRow = sortedRows.find((item) => item.status === 'Paid' && toAmount(item.amount) > 0);
	if (latestPaidRow) {
		return toAmount(latestPaidRow.amount);
	}

	const latestPositiveRow = sortedRows.find((item) => toAmount(item.amount) > 0);
	if (latestPositiveRow) {
		return toAmount(latestPositiveRow.amount);
	}

	return 0;
};

const resolvePayrollStartMonth = ({ payrollRows, targetMonth, teacher }) => {
	const teacherStartMonth = getTeacherPayrollStartMonth(teacher);
	const existingMonths = payrollRows
		.map((item) => getMonthDateFromKey(item.month))
		.filter(Boolean)
		.sort((left, right) => left.getTime() - right.getTime());

	if (existingMonths.length === 0) {
		return teacherStartMonth > targetMonth ? targetMonth : teacherStartMonth;
	}

	const startMonth = existingMonths[0] > teacherStartMonth ? teacherStartMonth : existingMonths[0];
	return startMonth > targetMonth ? targetMonth : startMonth;
};

const applyManualPendingSalaryOverride = async ({
	teacherId,
	targetPendingSalary,
	monthlyAmount,
	session,
	anchorDate = new Date(),
	skipEnsure = false
} = {}) => {
	if (!teacherId) {
		return [];
	}

	const teacher = await withSession(
		Teacher.findById(teacherId).select('_id joiningDate createdAt monthlySalary pendingSalary'),
		session
	);
	if (!teacher) {
		return [];
	}

	const normalizedMonthlyAmount = toAmount(
		monthlyAmount === undefined || monthlyAmount === null || String(monthlyAmount).trim() === ''
			? teacher.monthlySalary
			: monthlyAmount
	);
	if (!Number.isFinite(normalizedMonthlyAmount) || normalizedMonthlyAmount <= 0) {
		const error = new Error('Monthly salary must be greater than zero');
		error.statusCode = 400;
		throw error;
	}

	const normalizedTargetPending = toAmount(targetPendingSalary);
	if (!Number.isFinite(normalizedTargetPending) || normalizedTargetPending < 0) {
		const error = new Error('Pending salary must be 0 or greater');
		error.statusCode = 400;
		throw error;
	}

	const targetMonth = getMonthStartDate(anchorDate);
	const startMonth = getTeacherPayrollStartMonth(teacher);
	const distributionMonths = listMonthStartsInRange({ fromDate: startMonth, toDate: targetMonth });
	const maxSupportedPendingSalary = toAmount(distributionMonths.length * normalizedMonthlyAmount);

	if (normalizedTargetPending > maxSupportedPendingSalary + EPSILON) {
		const error = new Error('Pending salary exceeds supported range from joining month to current month');
		error.statusCode = 400;
		throw error;
	}

	const payrollRows = skipEnsure
		? await withSession(Payroll.find({ teacherId: teacher._id }).sort({ month: 1, createdAt: 1 }), session)
		: await ensureMonthlyPayrollForTeacher({
			teacherId: teacher._id,
			session,
			anchorDate,
			monthlyAmount: normalizedMonthlyAmount
		});

	const sortedRows = [...payrollRows].sort((left, right) => {
		const leftTime = new Date(getMonthDateFromKey(left.month) || left.createdAt || 0).getTime();
		const rightTime = new Date(getMonthDateFromKey(right.month) || right.createdAt || 0).getTime();
		return leftTime - rightTime;
	});

	const payrollByMonth = new Map(sortedRows.map((item) => [normalizeMonthKey(item.month), item]));
	const pendingChunks = splitIntoMonthlyChunks(normalizedTargetPending, normalizedMonthlyAmount);
	const affectedMonths = listTrailingMonthStarts({ monthCount: pendingChunks.length, anchorDate: targetMonth });
	const monthPendingMap = new Map();

	for (let index = 0; index < affectedMonths.length; index += 1) {
		const monthKey = getMonthKey(affectedMonths[index]);
		monthPendingMap.set(monthKey, toAmount(pendingChunks[index] || 0));
	}

	const targetMonthKeys = new Set(distributionMonths.map((monthDate) => getMonthKey(monthDate)));

	for (const monthDate of distributionMonths) {
		const monthKey = getMonthKey(monthDate);
		const monthPending = monthPendingMap.get(monthKey) || 0;
		const amount = monthPending > 0 ? monthPending : normalizedMonthlyAmount;
		const status = monthPending > 0 ? 'Pending' : 'Paid';

		let payroll = payrollByMonth.get(monthKey);
		if (!payroll) {
			payroll = new Payroll({
				teacherId: teacher._id,
				month: monthKey,
				amount,
				status,
				pendingSalaryCleared: 0
			});
			if (status === 'Pending') {
				payroll.paidOn = undefined;
				payroll.paymentMethod = undefined;
				payroll.processedByAdmin = undefined;
				payroll.receiptId = undefined;
			}
			await payroll.save({ session });
			payrollByMonth.set(monthKey, payroll);
			continue;
		}

		payroll.month = monthKey;
		payroll.amount = amount;
		payroll.status = status;
		if (status === 'Pending') {
			payroll.paidOn = undefined;
			payroll.paymentMethod = undefined;
			payroll.processedByAdmin = undefined;
			payroll.pendingSalaryCleared = 0;
			payroll.receiptId = undefined;
		}
		await payroll.save({ session });
	}

	for (const payroll of sortedRows) {
		if (targetMonthKeys.has(normalizeMonthKey(payroll.month))) {
			continue;
		}

		payroll.month = normalizeMonthKey(payroll.month) || getMonthKey(payroll.createdAt || anchorDate);
		payroll.amount = normalizedMonthlyAmount;
		payroll.status = 'Paid';
		payroll.paidOn = undefined;
		payroll.paymentMethod = undefined;
		payroll.processedByAdmin = undefined;
		payroll.pendingSalaryCleared = 0;
		payroll.receiptId = undefined;
		await payroll.save({ session });
	}

	const refreshedRows = await withSession(
		Payroll.find({ teacherId: teacher._id }).sort({ month: -1, createdAt: -1 }),
		session
	);

	const finalPending = toAmount(refreshedRows.reduce((sum, payroll) => sum + calculatePendingSalaryAmount(payroll), 0));
	const shouldUpdateTeacherSalary =
		!areAmountsEqual(teacher.pendingSalary || 0, finalPending) ||
		!areAmountsEqual(teacher.monthlySalary || 0, normalizedMonthlyAmount);

	if (shouldUpdateTeacherSalary) {
		teacher.pendingSalary = finalPending;
		teacher.monthlySalary = normalizedMonthlyAmount;
		await teacher.save({ session });
	}

	return refreshedRows;
};

const ensureMonthlyPayrollForTeacher = async ({ teacherId, session, anchorDate = new Date(), monthlyAmount } = {}) => {
	if (!teacherId) {
		return [];
	}

	const teacher = await withSession(
		Teacher.findById(teacherId).select('_id joiningDate createdAt monthlySalary pendingSalary'),
		session
	);
	if (!teacher) {
		return [];
	}

	const targetMonth = getMonthStartDate(anchorDate);

	let payrollRows = await withSession(
		Payroll.find({ teacherId: teacher._id }).sort({ month: 1, createdAt: 1 }),
		session
	);
	const hadExistingRows = payrollRows.length > 0;

	for (const payroll of payrollRows) {
		await normalizePayrollRow({ payroll, session });
	}

	payrollRows = await withSession(
		Payroll.find({ teacherId: teacher._id }).sort({ month: 1, createdAt: 1 }),
		session
	);

	const resolvedMonthlyAmount = toAmount(
		monthlyAmount === undefined || monthlyAmount === null || String(monthlyAmount).trim() === ''
			? teacher.monthlySalary || inferMonthlySalaryAmount(payrollRows)
			: monthlyAmount
	);

	if (
		payrollRows.length === 0 &&
		toAmount(teacher.pendingSalary) > EPSILON &&
		resolvedMonthlyAmount > EPSILON
	) {
		return applyManualPendingSalaryOverride({
			teacherId: teacher._id,
			targetPendingSalary: toAmount(teacher.pendingSalary),
			monthlyAmount: resolvedMonthlyAmount,
			session,
			anchorDate,
			skipEnsure: true
		});
	}

	const startMonth = resolvePayrollStartMonth({ payrollRows, targetMonth, teacher });
	const existingMonthSet = new Set(payrollRows.map((item) => normalizeMonthKey(item.month)).filter(Boolean));
	const latestExistingMonthTime = payrollRows.reduce((latest, payroll) => {
		const payrollMonthDate = getMonthDateFromKey(payroll.month) || getMonthStartDate(payroll.createdAt || anchorDate);
		return Math.max(latest, payrollMonthDate.getTime());
	}, 0);

	const rowsToCreate = listMonthStartsInRange({ fromDate: startMonth, toDate: targetMonth })
		.filter((monthDate) => !existingMonthSet.has(getMonthKey(monthDate)))
		.map((monthDate) => {
			const shouldCreateAsPending = hadExistingRows && monthDate.getTime() > latestExistingMonthTime;
			return {
				teacherId: teacher._id,
				month: getMonthKey(monthDate),
				amount: resolvedMonthlyAmount,
				status: shouldCreateAsPending ? 'Pending' : 'Paid',
				pendingSalaryCleared: 0
			};
		});

	if (rowsToCreate.length > 0) {
		try {
			await Payroll.insertMany(rowsToCreate, { ordered: false, session });
		} catch (error) {
			const duplicateKeyError =
				error?.code === 11000 ||
				(error?.writeErrors || []).some((item) => item?.code === 11000);
			if (!duplicateKeyError) {
				throw error;
			}
		}
	}

	const refreshedRows = await withSession(
		Payroll.find({ teacherId: teacher._id }).sort({ month: -1, createdAt: -1 }),
		session
	);

	const finalPending = toAmount(refreshedRows.reduce((sum, payroll) => sum + calculatePendingSalaryAmount(payroll), 0));
	if (!areAmountsEqual(teacher.pendingSalary || 0, finalPending)) {
		teacher.pendingSalary = finalPending;
		await teacher.save({ session });
	}

	return refreshedRows;
};

const ensureMonthlyPayrollForAllTeachers = async ({ session, anchorDate = new Date() } = {}) => {
	const teachers = await withSession(Teacher.find({}).select('_id'), session);
	for (const teacher of teachers) {
		await ensureMonthlyPayrollForTeacher({ teacherId: teacher._id, session, anchorDate });
	}
};

module.exports = {
	getMonthStartDate,
	getMonthKey,
	getMonthDateFromKey,
	normalizeMonthKey,
	toAmount,
	calculatePendingSalaryAmount,
	applyManualPendingSalaryOverride,
	ensureMonthlyPayrollForTeacher,
	ensureMonthlyPayrollForAllTeachers
};