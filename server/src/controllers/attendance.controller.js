const asyncHandler = require('../middleware/async.middleware');
const attendanceService = require('../services/attendance.service');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');

const isValidObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ''));
const getTodayAttendanceDate = () => attendanceService.normalizeAttendanceDate(new Date());

const ensureDateIsNotFuture = (normalizedDate) => {
	if (!(normalizedDate instanceof Date)) {
		return;
	}

	if (normalizedDate.getTime() > getTodayAttendanceDate().getTime()) {
		const error = new Error('Attendance cannot be marked for future date');
		error.statusCode = 400;
		throw error;
	}
};

const getTeacherContext = async (userId) => {
	const teacher = await Teacher.findOne({ userId }).select('_id classIds').lean();
	if (!teacher) {
		return { teacherId: null, classIds: [] };
	}

	const classIds = (Array.isArray(teacher.classIds) ? teacher.classIds : [])
		.map((item) => String(item || ''))
		.filter(Boolean);

	return {
		teacherId: teacher._id,
		classIds
	};
};

const ensureTeacherClassAccess = (classIds = [], classId) => {
	const classSet = new Set(classIds.map((item) => String(item || '')));
	if (!classSet.has(String(classId || ''))) {
		const error = new Error('Unauthorized');
		error.statusCode = 403;
		throw error;
	}
};

const getStudentClassMap = async (studentIds = []) => {
	if (studentIds.length === 0) {
		return new Map();
	}

	const students = await Student.find({ _id: { $in: studentIds } }).select('_id classId').lean();
	const classMap = new Map(students.map((student) => [String(student._id), String(student.classId || '')]));

	if (classMap.size !== studentIds.length) {
		const error = new Error('One or more students were not found');
		error.statusCode = 404;
		throw error;
	}

	return classMap;
};

const normalizeBulkAttendancePayload = (payload) => {
	const entries = Array.isArray(payload) ? payload : Array.isArray(payload?.records) ? payload.records : [];
	if (entries.length === 0) {
		const error = new Error('Attendance payload is required');
		error.statusCode = 400;
		throw error;
	}

	return entries.map((item) => {
		const studentId = String(item?.studentId || '').trim();
		const classId = String(item?.classId || '').trim();

		if (!isValidObjectId(studentId) || !isValidObjectId(classId)) {
			const error = new Error('Invalid student or class in attendance payload');
			error.statusCode = 400;
			throw error;
		}

		const normalizedDate = attendanceService.normalizeAttendanceDate(item?.date);
		return {
			studentId,
			classId,
			date: normalizedDate,
			status: attendanceService.normalizeAttendanceStatus(item?.status)
		};
	});
};

const ensureNoDuplicatePairsInPayload = (rows = []) => {
	const seen = new Set();

	for (const row of rows) {
		const key = `${String(row.studentId)}::${row.date.toISOString()}`;
		if (seen.has(key)) {
			const error = new Error('Duplicate student/date entries found in attendance payload');
			error.statusCode = 400;
			throw error;
		}
		seen.add(key);
	}
};

const ensureNoExistingAttendanceForPairs = async (rows = []) => {
	const studentIds = [...new Set(rows.map((row) => String(row.studentId)))];
	const dates = [...new Set(rows.map((row) => row.date.toISOString()))].map((value) => new Date(value));
	const existing = await attendanceService.findExistingByStudentDate({ studentIds, dates });

	const requestedPairSet = new Set(rows.map((row) => `${String(row.studentId)}::${row.date.toISOString()}`));
	const hasConflict = existing.some((row) => {
		const key = `${String(row.studentId)}::${new Date(row.date).toISOString()}`;
		return requestedPairSet.has(key);
	});

	if (hasConflict) {
		const error = new Error('Attendance already marked for this date');
		error.statusCode = 409;
		throw error;
	}
};

const markAttendance = asyncHandler(async (req, res) => {
	if (req.user?.role !== 'teacher') {
		return res.status(403).json({ success: false, message: 'Unauthorized' });
	}

	const { teacherId, classIds } = await getTeacherContext(req.user._id);
	if (!teacherId) {
		return res.status(403).json({ success: false, message: 'Unauthorized' });
	}

	const rows = normalizeBulkAttendancePayload(req.body);
	ensureNoDuplicatePairsInPayload(rows);

	for (const row of rows) {
		ensureDateIsNotFuture(row.date);
	}

	for (const row of rows) {
		ensureTeacherClassAccess(classIds, row.classId);
	}

	const studentClassMap = await getStudentClassMap([...new Set(rows.map((row) => String(row.studentId)))]);
	for (const row of rows) {
		const studentClassId = studentClassMap.get(String(row.studentId));
		if (String(studentClassId || '') !== String(row.classId || '')) {
			const error = new Error('Student does not belong to the selected class');
			error.statusCode = 400;
			throw error;
		}
	}

	await ensureNoExistingAttendanceForPairs(rows);

	try {
		const created = await attendanceService.markAttendanceBulk({
			records: rows.map((row) => ({
				studentId: row.studentId,
				classId: row.classId,
				date: row.date,
				status: row.status,
				markedBy: req.user._id
			}))
		});

		await attendanceService.syncStudentAttendancePercentages({
			studentIds: rows.map((row) => row.studentId)
		});

		return res.status(201).json({
			success: true,
			message: 'Attendance saved successfully',
			data: created
		});
	} catch (error) {
		if (attendanceService.isDuplicateAttendanceError(error)) {
			return res.status(409).json({ success: false, message: 'Attendance already marked for this date' });
		}
		throw error;
	}
});

const getAttendanceByClassAndDate = asyncHandler(async (req, res) => {
	const page = req.query?.page || req.query?._page;
	const limit = req.query?.limit || req.query?._limit;

	if (req.user?.role === 'student') {
		const student = await Student.findOne({ userId: req.user._id }).select('_id classId').lean();
		if (!student) {
			return res.json({ success: true, data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } });
		}

		const filter = { studentId: student._id };
		if (req.query?.date) {
			filter.date = attendanceService.normalizeAttendanceDate(req.query.date);
		}

		const listResult = await attendanceService.listAttendance({
			filter,
			page,
			limit,
			sort: { date: -1, createdAt: -1 }
		});

		return res.json({ success: true, data: listResult.records, pagination: listResult.pagination });
	}

	const classId = String(req.query?.classId || '').trim();
	const date = req.query?.date;

	if (!classId) {
		return res.status(400).json({ success: false, message: 'classId is required' });
	}

	if (!isValidObjectId(classId)) {
		return res.status(400).json({ success: false, message: 'Invalid class selected' });
	}

	if (req.user?.role === 'teacher') {
		const { teacherId, classIds } = await getTeacherContext(req.user._id);
		if (!teacherId) {
			return res.status(403).json({ success: false, message: 'Unauthorized' });
		}

		ensureTeacherClassAccess(classIds, classId);
	}

	if (!date) {
		const listResult = await attendanceService.listClassAttendanceHistory({
			classId,
			page,
			limit
		});

		return res.json({
			success: true,
			data: listResult.records,
			pagination: listResult.pagination,
			mode: 'history'
		});
	}

	const normalizedDate = attendanceService.normalizeAttendanceDate(date);
	const listResult = await attendanceService.listAttendance({
		filter: { classId, date: normalizedDate },
		page,
		limit,
		sort: { createdAt: 1, _id: 1 }
	});

	return res.json({ success: true, data: listResult.records, pagination: listResult.pagination });
});

const updateAttendance = asyncHandler(async (req, res) => {
	const existing = await attendanceService.findById(req.params.id);
	if (!existing) {
		return res.status(404).json({ success: false, message: 'Attendance not found' });
	}

	const existingClassId = String(existing.classId?._id || existing.classId || '');

	if (req.user?.role === 'teacher') {
		const { teacherId, classIds } = await getTeacherContext(req.user._id);
		if (!teacherId) {
			return res.status(403).json({ success: false, message: 'Unauthorized' });
		}

		ensureTeacherClassAccess(classIds, existingClassId);

		if (req.body?.classId) {
			ensureTeacherClassAccess(classIds, req.body.classId);
		}
	}

	const nextStudentId = req.body?.studentId ? String(req.body.studentId) : String(existing.studentId?._id || existing.studentId || '');
	const nextClassId = req.body?.classId ? String(req.body.classId) : existingClassId;
	const nextDate = req.body?.date ? attendanceService.normalizeAttendanceDate(req.body.date) : attendanceService.normalizeAttendanceDate(existing.date);
	const nextStatus = attendanceService.normalizeAttendanceStatus(req.body?.status || existing.status);
	ensureDateIsNotFuture(nextDate);

	if (!isValidObjectId(nextStudentId) || !isValidObjectId(nextClassId)) {
		return res.status(400).json({ success: false, message: 'Invalid student or class selected' });
	}

	const student = await Student.findById(nextStudentId).select('classId').lean();
	if (!student) {
		return res.status(404).json({ success: false, message: 'Student not found' });
	}

	if (String(student.classId || '') !== String(nextClassId || '')) {
		return res.status(400).json({ success: false, message: 'Student does not belong to the selected class' });
	}

	try {
		const updated = await attendanceService.updateById(req.params.id, {
			studentId: nextStudentId,
			classId: nextClassId,
			date: nextDate,
			status: nextStatus,
			...(req.user?.role === 'teacher' ? { markedBy: req.user._id } : {})
		});

		if (!updated) {
			return res.status(404).json({ success: false, message: 'Attendance not found' });
		}

		await attendanceService.syncStudentAttendancePercentages({
			studentIds: [
				String(existing.studentId?._id || existing.studentId || ''),
				nextStudentId
			]
		});

		return res.json({ success: true, data: updated });
	} catch (error) {
		if (attendanceService.isDuplicateAttendanceError(error)) {
			return res.status(409).json({ success: false, message: 'Attendance already marked for this date' });
		}
		throw error;
	}
});

const deleteAttendance = asyncHandler(async (req, res) => {
	const deleted = await attendanceService.deleteById(req.params.id);
	if (!deleted) {
		return res.status(404).json({ success: false, message: 'Attendance not found' });
	}

	await attendanceService.syncStudentAttendancePercentages({
		studentIds: [String(deleted.studentId || '')]
	});

	return res.json({ success: true, message: 'Attendance deleted successfully' });
});

module.exports = {
	markAttendance,
	getAttendanceByClassAndDate,
	updateAttendance,
	deleteAttendance
};