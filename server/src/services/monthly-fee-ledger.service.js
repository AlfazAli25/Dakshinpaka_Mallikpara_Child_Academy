const Fee = require('../models/fee.model');
const Student = require('../models/student.model');

const MONTHLY_FEE_AMOUNT = 200;

const FEE_STATUS = {
	PENDING: 'PENDING',
	PARTIALLY_PAID: 'PARTIALLY PAID',
	PAID: 'PAID'
};

const FEE_STATUS_VALUES = Object.values(FEE_STATUS);

const withSession = (query, session) => (session ? query.session(session) : query);

const getMonthStartDate = (value = new Date()) => {
	const date = value instanceof Date ? value : new Date(value);
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

const addMonths = (date, monthCount) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthCount, 1));

const getMonthKey = (value = new Date()) => {
	const date = getMonthStartDate(value);
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	return `${date.getUTCFullYear()}-${month}`;
};

const getMonthDateFromKey = (monthKey) => {
	const [year, month] = String(monthKey || '').split('-').map(Number);
	if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
		return null;
	}

	return new Date(Date.UTC(year, month - 1, 1));
};

const calculateFeePendingAmount = (fee) => {
	const amountDue = Math.max(Number(fee?.amountDue || 0), 0);
	const amountPaid = Math.max(Number(fee?.amountPaid || 0), 0);
	return Math.max(amountDue - amountPaid, 0);
};

const deriveFeeStatus = ({ amountDue, amountPaid }) => {
	const pendingAmount = Math.max(Number(amountDue || 0) - Number(amountPaid || 0), 0);
	if (pendingAmount === 0) {
		return FEE_STATUS.PAID;
	}

	return Number(amountPaid || 0) > 0 ? FEE_STATUS.PARTIALLY_PAID : FEE_STATUS.PENDING;
};

const normalizeFeeRow = async ({ fee, session }) => {
	const normalizedMonthKey = fee.monthKey || getMonthKey(fee.dueDate || fee.createdAt || new Date());
	const normalizedDueDate = getMonthDateFromKey(normalizedMonthKey) || getMonthStartDate(fee.dueDate || fee.createdAt || new Date());
	const normalizedAmountDue = Number.isFinite(Number(fee.amountDue)) && Number(fee.amountDue) >= 0
		? Number(fee.amountDue)
		: MONTHLY_FEE_AMOUNT;
	const normalizedAmountPaid = Math.max(Math.min(Number(fee.amountPaid || 0), normalizedAmountDue), 0);
	const normalizedStatus = deriveFeeStatus({ amountDue: normalizedAmountDue, amountPaid: normalizedAmountPaid });

	const shouldUpdate =
		fee.monthKey !== normalizedMonthKey ||
		!fee.dueDate ||
		new Date(fee.dueDate).toISOString() !== normalizedDueDate.toISOString() ||
		Number(fee.amountDue || 0) !== normalizedAmountDue ||
		Number(fee.amountPaid || 0) !== normalizedAmountPaid ||
		!FEE_STATUS_VALUES.includes(fee.status) ||
		fee.status !== normalizedStatus;

	if (!shouldUpdate) {
		return fee;
	}

	fee.monthKey = normalizedMonthKey;
	fee.dueDate = normalizedDueDate;
	fee.amountDue = normalizedAmountDue;
	fee.amountPaid = normalizedAmountPaid;
	fee.status = normalizedStatus;
	await fee.save({ session });
	return fee;
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

const ensureMonthlyFeesForStudent = async ({ studentId, session, anchorDate = new Date() }) => {
	if (!studentId) {
		return [];
	}

	const student = await withSession(
		Student.findById(studentId).select('_id createdAt pendingFees'),
		session
	);
	if (!student) {
		return [];
	}

	const studentStartMonth = getMonthStartDate(student.createdAt || anchorDate);
	const targetMonth = getMonthStartDate(anchorDate);
	const existingRows = await withSession(
		Fee.find({ studentId: student._id }).sort({ dueDate: 1, createdAt: 1 }),
		session
	);

	const monthKeySet = new Set();
	for (const fee of existingRows) {
		const normalized = await normalizeFeeRow({ fee, session });
		if (!monthKeySet.has(normalized.monthKey)) {
			monthKeySet.add(normalized.monthKey);
		}
	}

	const monthsToCreate = listMonthStartsInRange({ fromDate: studentStartMonth, toDate: targetMonth })
		.filter((monthDate) => !monthKeySet.has(getMonthKey(monthDate)))
		.map((monthDate) => ({
			studentId: student._id,
			dueDate: monthDate,
			monthKey: getMonthKey(monthDate),
			amountDue: MONTHLY_FEE_AMOUNT,
			amountPaid: 0,
			status: FEE_STATUS.PENDING
		}));

	if (monthsToCreate.length > 0) {
		try {
			await Fee.insertMany(monthsToCreate, { ordered: false, session });
		} catch (error) {
			const duplicateKeyError =
				error?.code === 11000 ||
				(error?.writeErrors || []).some((item) => item?.code === 11000);
			if (!duplicateKeyError) {
				throw error;
			}
		}
	}

	const freshFees = await withSession(
		Fee.find({ studentId: student._id }).select('amountDue amountPaid'),
		session
	);
	const ledgerPending = freshFees.reduce((sum, fee) => sum + calculateFeePendingAmount(fee), 0);

	if (Number(student.pendingFees || 0) !== ledgerPending) {
		student.pendingFees = ledgerPending;
		await student.save({ session });
	}

	return withSession(Fee.find({ studentId: student._id }).sort({ dueDate: 1, createdAt: 1 }), session);
};

const ensureMonthlyFeesForAllStudents = async ({ session, anchorDate = new Date() } = {}) => {
	const students = await withSession(Student.find({}).select('_id'), session);
	for (const student of students) {
		await ensureMonthlyFeesForStudent({ studentId: student._id, session, anchorDate });
	}
};

module.exports = {
	MONTHLY_FEE_AMOUNT,
	FEE_STATUS,
	FEE_STATUS_VALUES,
	getMonthKey,
	getMonthStartDate,
	calculateFeePendingAmount,
	deriveFeeStatus,
	ensureMonthlyFeesForStudent,
	ensureMonthlyFeesForAllStudents
};
