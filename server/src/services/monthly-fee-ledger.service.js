const Fee = require('../models/fee.model');
const Student = require('../models/student.model');

const MONTHLY_FEE_AMOUNT = 200;
const EPSILON = 0.0001;
const LEDGER_START_DATE = new Date(Date.UTC(2025, 0, 1));
const ALL_STUDENTS_SYNC_COOLDOWN_MS = Number(process.env.ALL_STUDENTS_FEE_SYNC_COOLDOWN_MS || 45000);
const ALL_STUDENTS_BATCH_SIZE = Math.min(Math.max(Number(process.env.ALL_STUDENTS_FEE_SYNC_BATCH_SIZE || 8), 1), 25);

const allStudentsSyncState = {
	inFlightPromise: null,
	lastCompletedAt: 0
};

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

const getStudentLedgerStartMonth = (student) => {
	const floorMonth = getMonthStartDate(LEDGER_START_DATE);
	const studentCreatedMonth = getMonthStartDate(student?.createdAt || floorMonth);
	return studentCreatedMonth > floorMonth ? studentCreatedMonth : floorMonth;
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

const needsPendingDistributionRebalance = (fees = []) => {
	const pendingRows = fees
		.map((fee) => ({ pendingAmount: calculateFeePendingAmount(fee) }))
		.filter((row) => row.pendingAmount > EPSILON);

	if (pendingRows.length === 0) {
		return false;
	}

	const partialPendingRows = pendingRows
		.map((row, index) => ({ ...row, index }))
		.filter((row) => !areAmountsEqual(row.pendingAmount, MONTHLY_FEE_AMOUNT));

	if (partialPendingRows.length > 1) {
		return true;
	}

	if (partialPendingRows.length === 1 && partialPendingRows[0].index !== 0) {
		return true;
	}

	for (let index = 1; index < pendingRows.length; index += 1) {
		if (!areAmountsEqual(pendingRows[index].pendingAmount, MONTHLY_FEE_AMOUNT)) {
			return true;
		}
	}

	return false;
};

const deriveFeeStatus = ({ amountDue, amountPaid }) => {
	const normalizedAmountPaid = Math.max(toAmount(amountPaid), 0);

	if (normalizedAmountPaid <= EPSILON) {
		return FEE_STATUS.PENDING;
	}

	if (normalizedAmountPaid < MONTHLY_FEE_AMOUNT) {
		return FEE_STATUS.PARTIALLY_PAID;
	}

	return FEE_STATUS.PAID;
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

	const studentStartMonth = getStudentLedgerStartMonth(student);
	const targetMonth = getMonthStartDate(anchorDate);
	let existingRows = await withSession(
		Fee.find({ studentId: student._id }).sort({ dueDate: 1, createdAt: 1 }),
		session
	);
	const hadExistingRows = existingRows.length > 0;

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

	if (existingRows.length === 0 && toAmount(student.pendingFees) > EPSILON) {
		await applyManualPendingFeesOverride({
			studentId: student._id,
			targetPendingFees: toAmount(student.pendingFees),
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

	const latestExistingMonthTime = existingRows.reduce((latest, fee) => {
		const feeMonthDate = getMonthDateFromKey(fee.monthKey) || getMonthStartDate(fee.dueDate || fee.createdAt || anchorDate);
		return Math.max(latest, feeMonthDate.getTime());
	}, 0);

	const monthsToCreate = listMonthStartsInRange({ fromDate: studentStartMonth, toDate: targetMonth })
		.filter((monthDate) => !monthKeySet.has(getMonthKey(monthDate)))
		.map((monthDate) => {
			const shouldAddAsPending = hadExistingRows && monthDate.getTime() > latestExistingMonthTime;
			return {
				studentId: student._id,
				dueDate: monthDate,
				monthKey: getMonthKey(monthDate),
				amountDue: MONTHLY_FEE_AMOUNT,
				amountPaid: shouldAddAsPending ? 0 : MONTHLY_FEE_AMOUNT,
				status: shouldAddAsPending ? FEE_STATUS.PENDING : FEE_STATUS.PAID
			};
		});

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

	let refreshedFees = await withSession(
		Fee.find({ studentId: student._id }).sort({ dueDate: 1, createdAt: 1 }),
		session
	);

	if (needsPendingDistributionRebalance(refreshedFees)) {
		const rebalanceTargetPending = toAmount(
			refreshedFees.reduce((sum, fee) => sum + calculateFeePendingAmount(fee), 0)
		);

		refreshedFees = await applyManualPendingFeesOverride({
			studentId: student._id,
			targetPendingFees: rebalanceTargetPending,
			session,
			anchorDate,
			skipEnsure: true
		});
	}

	const ledgerPending = toAmount(refreshedFees.reduce((sum, fee) => sum + calculateFeePendingAmount(fee), 0));

	if (!areAmountsEqual(student.pendingFees || 0, ledgerPending)) {
		student.pendingFees = ledgerPending;
		await student.save({ session });
	}

	return refreshedFees;
};

const applyManualPendingFeesOverride = async ({ studentId, targetPendingFees, session, anchorDate = new Date(), skipEnsure = false }) => {
	if (!studentId) {
		return [];
	}

	const student = await withSession(Student.findById(studentId).select('_id pendingFees createdAt'), session);
	if (!student) {
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
	const baseStartMonth = getStudentLedgerStartMonth(student);
	const targetEndMonth = getMonthStartDate(anchorDate);
	const pendingChunks = splitIntoMonthlyChunks(normalizedTargetPending);

	// If pending exceeds months since registration, extend backward up to ledger start.
	const requiredStartMonth = pendingChunks.length > 0 ? addMonths(targetEndMonth, -(pendingChunks.length - 1)) : targetEndMonth;
	const ledgerFloorMonth = getMonthStartDate(LEDGER_START_DATE);
	const targetStartMonth = requiredStartMonth < baseStartMonth ? requiredStartMonth : baseStartMonth;
	const boundedStartMonth = targetStartMonth < ledgerFloorMonth ? ledgerFloorMonth : targetStartMonth;
	const distributionMonths = listMonthStartsInRange({ fromDate: boundedStartMonth, toDate: targetEndMonth });
	const maxSupportedPendingAmount = toAmount(distributionMonths.length * MONTHLY_FEE_AMOUNT);

	if (normalizedTargetPending > maxSupportedPendingAmount + EPSILON) {
		const error = new Error('Pending fees exceed supported fee ledger range');
		error.statusCode = 400;
		throw error;
	}

	const targetMonthKeys = new Set(distributionMonths.map((monthDate) => getMonthKey(monthDate)));
	const feeByMonthKey = new Map(sortedFees.map((fee) => [fee.monthKey, fee]));
	const affectedMonths = listTrailingMonthStarts({ monthCount: pendingChunks.length, anchorDate: targetEndMonth });
	const newestFirstAffectedMonths = [...affectedMonths].reverse();
	const monthPendingMap = new Map();

	// Allocate full pending months from current month backwards.
	// Any remainder then naturally lands on the oldest pending month.
	for (let index = 0; index < newestFirstAffectedMonths.length; index += 1) {
		const monthKey = getMonthKey(newestFirstAffectedMonths[index]);
		monthPendingMap.set(monthKey, toAmount(pendingChunks[index] || 0));
	}

	for (let index = 0; index < distributionMonths.length; index += 1) {
		const monthDate = distributionMonths[index];
		const monthKey = getMonthKey(monthDate);
		const monthPending = monthPendingMap.get(monthKey) || 0;
		const amountDue = MONTHLY_FEE_AMOUNT;
		const amountPaid = toAmount(Math.max(MONTHLY_FEE_AMOUNT - monthPending, 0));
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

		fee.dueDate = getMonthDateFromKey(fee.monthKey) || getMonthStartDate(fee.dueDate || anchorDate);
		fee.amountDue = MONTHLY_FEE_AMOUNT;
		fee.amountPaid = MONTHLY_FEE_AMOUNT;
		fee.status = FEE_STATUS.PAID;
		fee.paymentDate = undefined;
		fee.paymentMethod = undefined;
		await fee.save({ session });
	}

	const refreshedFees = await withSession(Fee.find({ studentId }).sort({ dueDate: 1, createdAt: 1 }), session);
	const finalPending = toAmount(refreshedFees.reduce((sum, fee) => sum + calculateFeePendingAmount(fee), 0));

	if (student && !areAmountsEqual(student.pendingFees || 0, finalPending)) {
		student.pendingFees = finalPending;
		await student.save({ session });
	}

	return refreshedFees;
};

const ensureMonthlyFeesForAllStudents = async ({ session, anchorDate = new Date() } = {}) => {
	const runSync = async () => {
		const students = await withSession(Student.find({}).select('_id').lean(), session);

		for (let index = 0; index < students.length; index += ALL_STUDENTS_BATCH_SIZE) {
			const batch = students.slice(index, index + ALL_STUDENTS_BATCH_SIZE);
			await Promise.all(
				batch.map((student) => ensureMonthlyFeesForStudent({ studentId: student._id, session, anchorDate }))
			);
		}
	};

	if (session) {
		await runSync();
		return;
	}

	const now = Date.now();
	if (allStudentsSyncState.inFlightPromise) {
		await allStudentsSyncState.inFlightPromise;
		return;
	}

	if (now - allStudentsSyncState.lastCompletedAt < ALL_STUDENTS_SYNC_COOLDOWN_MS) {
		return;
	}

	allStudentsSyncState.inFlightPromise = runSync()
		.then(() => {
			allStudentsSyncState.lastCompletedAt = Date.now();
		})
		.finally(() => {
			allStudentsSyncState.inFlightPromise = null;
		});

	await allStudentsSyncState.inFlightPromise;
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
