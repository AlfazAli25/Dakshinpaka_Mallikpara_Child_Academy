const mongoose = require('mongoose');
const Attendance = require('../models/attendance.model');
const Student = require('../models/student.model');

const ATTENDANCE_STATUS = {
	PRESENT: 'Present',
	ABSENT: 'Absent'
};

const ATTENDANCE_POPULATE = [
	{
		path: 'studentId',
		select: 'admissionNo rollNo classId userId',
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

const normalizeStudentIdList = (studentIds = []) =>
	[...new Set((Array.isArray(studentIds) ? studentIds : [])
		.map((item) => String(item || '').trim())
		.filter((item) => mongoose.Types.ObjectId.isValid(item)))];

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

const listClassAttendanceHistory = async ({ classId, page = 1, limit = 10 } = {}) => {
	if (!mongoose.Types.ObjectId.isValid(String(classId || ''))) {
		const error = new Error('Invalid class selected');
		error.statusCode = 400;
		throw error;
	}

	const { page: safePage, limit: safeLimit, skip } = getPagination({ page, limit });
	const classObjectId = new mongoose.Types.ObjectId(String(classId));
	const matchStage = { $match: { classId: classObjectId } };
	const groupStage = {
		$group: {
			_id: '$date',
			totalCount: { $sum: 1 },
			presentCount: {
				$sum: {
					$cond: [{ $eq: ['$status', ATTENDANCE_STATUS.PRESENT] }, 1, 0]
				}
			},
			absentCount: {
				$sum: {
					$cond: [{ $eq: ['$status', ATTENDANCE_STATUS.ABSENT] }, 1, 0]
				}
			},
			lastUpdatedAt: { $max: '$updatedAt' }
		}
	};

	const [records, totals] = await Promise.all([
		Attendance.aggregate([
			matchStage,
			groupStage,
			{ $sort: { _id: -1 } },
			{ $skip: skip },
			{ $limit: safeLimit },
			{
				$project: {
					_id: 0,
					date: '$_id',
					dateKey: { $dateToString: { format: '%Y-%m-%d', date: '$_id', timezone: 'UTC' } },
					totalCount: 1,
					presentCount: 1,
					absentCount: 1,
					lastUpdatedAt: 1
				}
			}
		]),
		Attendance.aggregate([matchStage, groupStage, { $count: 'total' }])
	]);

	const total = Number(totals[0]?.total || 0);
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

const syncStudentAttendancePercentages = async ({ studentIds = [] } = {}) => {
	const normalizedStudentIds = normalizeStudentIdList(studentIds);
	if (normalizedStudentIds.length === 0) {
		return;
	}

	const objectIds = normalizedStudentIds.map((item) => new mongoose.Types.ObjectId(item));
	const stats = await Attendance.aggregate([
		{ $match: { studentId: { $in: objectIds } } },
		{
			$group: {
				_id: '$studentId',
				totalCount: { $sum: 1 },
				presentCount: {
					$sum: {
						$cond: [{ $eq: ['$status', ATTENDANCE_STATUS.PRESENT] }, 1, 0]
					}
				}
			}
		}
	]);

	const statsByStudentId = new Map(
		stats.map((item) => [
			String(item._id),
			{
				totalCount: Number(item.totalCount || 0),
				presentCount: Number(item.presentCount || 0)
			}
		])
	);

	const bulkOps = objectIds.map((studentId) => {
		const stat = statsByStudentId.get(String(studentId));
		const totalCount = Number(stat?.totalCount || 0);
		const presentCount = Number(stat?.presentCount || 0);
		const attendancePercentage =
			totalCount > 0 ? Number(((presentCount / totalCount) * 100).toFixed(2)) : 0;

		return {
			updateOne: {
				filter: { _id: studentId },
				update: { $set: { attendance: attendancePercentage } }
			}
		};
	});

	if (bulkOps.length > 0) {
		await Student.bulkWrite(bulkOps, { ordered: false });
	}
};

module.exports = {
	ATTENDANCE_STATUS,
	normalizeAttendanceDate,
	normalizeAttendanceStatus,
	isDuplicateAttendanceError,
	findAll,
	findById,
	listAttendance,
	listClassAttendanceHistory,
	findExistingByStudentDate,
	markAttendanceBulk,
	updateById,
	deleteById,
	syncStudentAttendancePercentages
};