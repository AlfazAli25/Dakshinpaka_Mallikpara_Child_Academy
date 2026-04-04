const Fee = require('../models/fee.model');
const Student = require('../models/student.model');

const MONTHLY_FEE_AMOUNT = 200;
const EPSILON = 0.0001;

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

const toAmount = (value) => {
	const numeric = Number(value || 0);
	if (!Number.isFinite(numeric)) {
		return 0;
	}

	return Math.round(numeric * 100) / 100;
};

const areAmountsEqual = (left, right) => Math.abs(toAmount(left) - toAmount(right)) <= EPSILON;

const calculateFeePendingAmount = (fee) => {
	const amountDue = Math.max(toAmount(fee?.amountDue), 0);
	const amountPaid = Math.max(toAmount(fee?.amountPaid), 0);
	return toAmount(Math.max(amountDue - amountPaid, 0));
};

const deriveFeeStatus = ({ amountDue, amountPaid }) => {
	const normalizedAmountDue = Math.max(toAmount(amountDue), 0);
	const normalizedAmountPaid = Math.max(toAmount(amountPaid), 0);
	const pendingAmount = toAmount(Math.max(normalizedAmountDue - normalizedAmountPaid, 0));
	if (areAmountsEqual(pendingAmount, 0)) {
		return FEE_STATUS.PAID;
	}

	if (normalizedAmountPaid > 0) {
		return FEE_STATUS.PARTIALLY_PAID;
	}

	if (normalizedAmountDue > 0 && normalizedAmountDue < MONTHLY_FEE_AMOUNT) {
		return FEE_STATUS.PARTIALLY_PAID;
	}

	return FEE_STATUS.PENDING;
};

const normalizeFeeRow = async ({ fee, session }) => {
	const normalizedMonthKey = fee.monthKey || getMonthKey(fee.dueDate || fee.createdAt || new Date());
	const normalizedDueDate = getMonthDateFromKey(normalizedMonthKey) || getMonthStartDate(fee.dueDate || fee.createdAt || new Date());
	const normalizedAmountDue = Number.isFinite(Number(fee.amountDue)) && Number(fee.amountDue) >= 0
		? toAmount(fee.amountDue)
		: MONTHLY_FEE_AMOUNT;
	const normalizedAmountPaid = toAmount(Math.max(Math.min(Number(fee.amountPaid || 0), normalizedAmountDue), 0));
	const normalizedStatus = deriveFeeStatus({ amountDue: normalizedAmountDue, amountPaid: normalizedAmountPaid });

	const shouldUpdate =
		fee.monthKey !== normalizedMonthKey ||
		!fee.dueDate ||
		new Date(fee.dueDate).toISOString() !== normalizedDueDate.toISOString() ||
		!areAmountsEqual(fee.amountDue || 0, normalizedAmountDue) ||
		!areAmountsEqual(fee.amountPaid || 0, normalizedAmountPaid) ||
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

const listTrailingMonthStarts = ({ monthCount, anchorDate = new Date() }) => {
	const normalizedMonthCount = Number(monthCount || 0);
	if (!Number.isInteger(normalizedMonthCount) || normalizedMonthCount <= 0) {
		return [];
	}

	const targetMonth = getMonthStartDate(anchorDate);
	const oldestMonth = addMonths(targetMonth, -(normalizedMonthCount - 1));
	return listMonthStartsInRange({ fromDate: oldestMonth, toDate: targetMonth });
};

const splitIntoMonthlyChunks = (amount) => {
	let remaining = toAmount(Math.max(amount, 0));
	const chunks = [];

	while (remaining > EPSILON) {
		const chunk = toAmount(Math.min(MONTHLY_FEE_AMOUNT, remaining));
		chunks.push(chunk);
		remaining = toAmount(remaining - chunk);
	}

	return chunks;
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
	let existingRows = await withSession(
		Fee.find({ studentId: student._id }).sort({ dueDate: 1, createdAt: 1 }),
		session
	);

	for (const fee of existingRows) {
		await normalizeFeeRow({ fee, session });
	}

	const hasOversizedDueRows = existingRows.some((fee) => toAmount(fee.amountDue) > MONTHLY_FEE_AMOUNT + EPSILON);
	if (hasOversizedDueRows) {
		const legacyPendingAmount = toAmount(existingRows.reduce((sum, fee) => sum + calculateFeePendingAmount(fee), 0));
		await applyManualPendingFeesOverride({
			studentId: student._id,
			targetPendingFees: legacyPendingAmount,
			session,
			anchorDate,
			skipEnsure: true
		});

		existingRows = await withSession(
			Fee.find({ studentId: student._id }).sort({ dueDate: 1, createdAt: 1 }),
			session
		);
	}

	const monthKeySet = new Set();
	for (const fee of existingRows) {
		if (!monthKeySet.has(fee.monthKey)) {
			monthKeySet.add(fee.monthKey);
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
	const ledgerPending = toAmount(freshFees.reduce((sum, fee) => sum + calculateFeePendingAmount(fee), 0));

	if (!areAmountsEqual(student.pendingFees || 0, ledgerPending)) {
		student.pendingFees = ledgerPending;
		await student.save({ session });
	}

	return withSession(Fee.find({ studentId: student._id }).sort({ dueDate: 1, createdAt: 1 }), session);
};

const applyManualPendingFeesOverride = async ({ studentId, targetPendingFees, session, anchorDate = new Date(), skipEnsure = false }) => {
	if (!studentId) {
		return [];
	}

	const normalizedTargetPending = toAmount(targetPendingFees);
	if (!Number.isFinite(normalizedTargetPending) || normalizedTargetPending < 0) {
		const error = new Error('Pending fees must be 0 or greater');
		error.statusCode = 400;
		throw error;
	}

	const fees = skipEnsure
		? await withSession(Fee.find({ studentId }).sort({ dueDate: 1, createdAt: 1 }), session)
		: await ensureMonthlyFeesForStudent({ studentId, session, anchorDate });
	const sortedFees = [...fees].sort((left, right) => {
		const leftTime = new Date(left.dueDate || left.createdAt || 0).getTime();
		const rightTime = new Date(right.dueDate || right.createdAt || 0).getTime();
		return leftTime - rightTime;
	});

	const totalPaid = toAmount(sortedFees.reduce((sum, fee) => sum + Math.max(toAmount(fee.amountPaid), 0), 0));
	const totalDueToDistribute = toAmount(totalPaid + normalizedTargetPending);
	const monthlyDueChunks = splitIntoMonthlyChunks(totalDueToDistribute);
	const distributionMonths = listTrailingMonthStarts({ monthCount: monthlyDueChunks.length, anchorDate });
	const targetMonthKeys = new Set(distributionMonths.map((monthDate) => getMonthKey(monthDate)));
	const feeByMonthKey = new Map(sortedFees.map((fee) => [fee.monthKey, fee]));

	let remainingPaid = totalPaid;

	for (let index = 0; index < distributionMonths.length; index += 1) {
		const monthDate = distributionMonths[index];
		const monthKey = getMonthKey(monthDate);
		const amountDue = toAmount(monthlyDueChunks[index] || 0);
		const amountPaid = toAmount(Math.min(amountDue, remainingPaid));
		remainingPaid = toAmount(Math.max(remainingPaid - amountPaid, 0));
		const status = deriveFeeStatus({ amountDue, amountPaid });

		let fee = feeByMonthKey.get(monthKey);
		if (!fee) {
			fee = new Fee({
				studentId,
				monthKey,
				dueDate: monthDate,
				amountDue,
				amountPaid,
				status,
				paymentDate: amountPaid > 0 ? new Date() : undefined,
				paymentMethod: amountPaid > 0 ? 'AUTO_REALLOCATION' : undefined
			});
			await fee.save({ session });
			feeByMonthKey.set(monthKey, fee);
			continue;
		}

		fee.dueDate = monthDate;
		fee.amountDue = amountDue;
		fee.amountPaid = amountPaid;
		fee.status = status;
		if (amountPaid <= 0) {
			fee.paymentDate = undefined;
			fee.paymentMethod = undefined;
		}
		await fee.save({ session });
	}

	for (const fee of sortedFees) {
		if (targetMonthKeys.has(fee.monthKey)) {
			continue;
		}

		const preservedPaid = Math.max(toAmount(fee.amountPaid), 0);
		fee.dueDate = getMonthDateFromKey(fee.monthKey) || getMonthStartDate(fee.dueDate || anchorDate);
		fee.amountDue = preservedPaid;
		fee.amountPaid = preservedPaid;
		fee.status = FEE_STATUS.PAID;
		if (preservedPaid <= EPSILON) {
			fee.paymentDate = undefined;
			fee.paymentMethod = undefined;
		}
		await fee.save({ session });
	}

	const refreshedFees = await withSession(Fee.find({ studentId }).sort({ dueDate: 1, createdAt: 1 }), session);
	const finalPending = toAmount(refreshedFees.reduce((sum, fee) => sum + calculateFeePendingAmount(fee), 0));
	const student = await withSession(Student.findById(studentId).select('_id pendingFees'), session);

	if (student && !areAmountsEqual(student.pendingFees || 0, finalPending)) {
		student.pendingFees = finalPending;
		await student.save({ session });
	}

	return refreshedFees;
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
	applyManualPendingFeesOverride,
	ensureMonthlyFeesForAllStudents
};
