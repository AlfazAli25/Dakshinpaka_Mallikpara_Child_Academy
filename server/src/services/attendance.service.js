const Attendance = require('../models/attendance.model');

const ATTENDANCE_STATUS = {
	PRESENT: 'Present',
	ABSENT: 'Absent'
};

const ATTENDANCE_POPULATE = [
	{
		path: 'studentId',
		select: 'admissionNo classId userId',
		populate: { path: 'userId', select: 'name email role' }
	},
	{ path: 'classId', select: 'name section' },
	{ path: 'markedBy', select: 'name email role' }
];

const toPositiveInt = (value, fallback) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}

	return Math.floor(parsed);
};

const normalizeAttendanceDate = (value) => {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		const error = new Error('Invalid attendance date');
		error.statusCode = 400;
		throw error;
	}

	return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

const normalizeAttendanceStatus = (value) =>
	String(value || '').trim().toLowerCase() === 'present'
		? ATTENDANCE_STATUS.PRESENT
		: ATTENDANCE_STATUS.ABSENT;

const getPagination = ({ page, limit } = {}) => {
	const safePage = toPositiveInt(page, 1);
	const safeLimit = Math.min(toPositiveInt(limit, 50), 200);

	return {
		page: safePage,
		limit: safeLimit,
		skip: (safePage - 1) * safeLimit
	};
};

const isDuplicateAttendanceError = (error) => {
	if (!error) {
		return false;
	}

	if (error.code === 11000) {
		return true;
	}

	if (Array.isArray(error.writeErrors)) {
		return error.writeErrors.some((entry) => entry?.code === 11000);
	}

	return false;
};

const findAll = async (filter = {}) =>
	Attendance.find(filter)
		.populate(ATTENDANCE_POPULATE)
		.sort({ date: -1, createdAt: -1 })
		.lean();

const findById = async (id) => Attendance.findById(id).populate(ATTENDANCE_POPULATE).lean();

const listAttendance = async ({ filter = {}, page = 1, limit = 50, sort = { date: -1, createdAt: -1 } } = {}) => {
	const { page: safePage, limit: safeLimit, skip } = getPagination({ page, limit });

	const [records, total] = await Promise.all([
		Attendance.find(filter)
			.populate(ATTENDANCE_POPULATE)
			.sort(sort)
			.skip(skip)
			.limit(safeLimit)
			.lean(),
		Attendance.countDocuments(filter)
	]);

	const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);
	return {
		records,
		pagination: {
			page: safePage,
			limit: safeLimit,
			total,
			totalPages
		}
	};
};

const findExistingByStudentDate = async ({ studentIds = [], dates = [] } = {}) => {
	if (!Array.isArray(studentIds) || studentIds.length === 0 || !Array.isArray(dates) || dates.length === 0) {
		return [];
	}

	return Attendance.find({
		studentId: { $in: studentIds },
		date: { $in: dates }
	})
		.select('_id studentId classId date status')
		.lean();
};

const markAttendanceBulk = async ({ records = [] } = {}) => {
	if (!Array.isArray(records) || records.length === 0) {
		return [];
	}

	const inserted = await Attendance.insertMany(records, { ordered: true });
	const insertedIds = inserted.map((item) => item._id);
	return Attendance.find({ _id: { $in: insertedIds } })
		.populate(ATTENDANCE_POPULATE)
		.sort({ createdAt: -1 })
		.lean();
};

const updateById = async (id, payload = {}) =>
	Attendance.findByIdAndUpdate(id, payload, { new: true, runValidators: true }).populate(ATTENDANCE_POPULATE).lean();

const deleteById = async (id) => Attendance.findByIdAndDelete(id).lean();

module.exports = {
	ATTENDANCE_STATUS,
	normalizeAttendanceDate,
	normalizeAttendanceStatus,
	isDuplicateAttendanceError,
	findAll,
	findById,
	listAttendance,
	findExistingByStudentDate,
	markAttendanceBulk,
	updateById,
	deleteById
};