const createCrudController = require('./crud.controller.factory');
const asyncHandler = require('../middleware/async.middleware');
const attendanceService = require('../services/attendance.service');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');
const Timetable = require('../models/timetable.model');

const base = createCrudController(attendanceService, 'Attendance');

const getTeacherContext = async (userId) => {
	const teacher = await Teacher.findOne({ userId }).select('_id classIds');
	if (!teacher) {
		return { teacherId: null, classIds: [] };
	}

	let classIds = Array.isArray(teacher.classIds) ? teacher.classIds.filter(Boolean) : [];
	if (classIds.length === 0) {
		const timetables = await Timetable.find({ 'schedule.teacherId': teacher._id }).select('classId');
		classIds = timetables.map((item) => item.classId).filter(Boolean);
	}

	return { teacherId: teacher._id, classIds };
};

const list = asyncHandler(async (req, res) => {
	if (req.user?.role === 'admin') {
		const data = await attendanceService.findAll(req.query || {});
		return res.json({ success: true, data });
	}

	if (req.user?.role === 'student') {
		const student = await Student.findOne({ userId: req.user._id }).select('_id');
		if (!student) {
			return res.json({ success: true, data: [] });
		}

		const data = await attendanceService.findAll({ studentId: student._id });
		return res.json({ success: true, data });
	}

	if (req.user?.role === 'teacher') {
		const { teacherId, classIds } = await getTeacherContext(req.user._id);
		if (!teacherId) {
			return res.json({ success: true, data: [] });
		}
		const filter = classIds.length
			? { classId: { $in: classIds } }
			: { markedBy: teacherId };

		const data = await attendanceService.findAll(filter);
		return res.json({ success: true, data });
	}

	return res.status(403).json({ success: false, message: 'Forbidden' });
});

const create = asyncHandler(async (req, res) => {
	if (req.user?.role === 'teacher') {
		const { teacherId, classIds } = await getTeacherContext(req.user._id);
		if (!teacherId) {
			return res.status(403).json({ success: false, message: 'Forbidden' });
		}

		const classSet = new Set(classIds.map((value) => String(value || '')));
		if (!classSet.has(String(req.body.classId || ''))) {
			return res.status(403).json({ success: false, message: 'You can only mark attendance for assigned classes' });
		}

		const item = await attendanceService.create({ ...req.body, markedBy: teacherId });
		return res.status(201).json({ success: true, data: item });
	}

	const item = await attendanceService.create(req.body);
	return res.status(201).json({ success: true, data: item });
});

const update = asyncHandler(async (req, res) => {
	const existing = await attendanceService.findById(req.params.id);
	if (!existing) {
		return res.status(404).json({ success: false, message: 'Attendance not found' });
	}

	if (req.user?.role === 'teacher') {
		const { teacherId, classIds } = await getTeacherContext(req.user._id);
		if (!teacherId) {
			return res.status(403).json({ success: false, message: 'Forbidden' });
		}

		const classSet = new Set(classIds.map((value) => String(value || '')));
		const existingClassId = String(existing.classId?._id || existing.classId || '');
		if (!classSet.has(existingClassId)) {
			return res.status(403).json({ success: false, message: 'Forbidden' });
		}

		const nextClassId = req.body.classId !== undefined ? String(req.body.classId || '') : existingClassId;
		if (!classSet.has(nextClassId)) {
			return res.status(403).json({ success: false, message: 'You can only update attendance for assigned classes' });
		}

		const item = await attendanceService.updateById(req.params.id, { ...req.body, markedBy: teacherId });
		return res.json({ success: true, data: item });
	}

	const item = await attendanceService.updateById(req.params.id, req.body);
	return res.json({ success: true, data: item });
});

module.exports = { ...base, list, create, update };