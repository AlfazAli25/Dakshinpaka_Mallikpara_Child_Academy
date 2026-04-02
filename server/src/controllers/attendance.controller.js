const createCrudController = require('./crud.controller.factory');
const asyncHandler = require('../middleware/async.middleware');
const attendanceService = require('../services/attendance.service');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');
const Timetable = require('../models/timetable.model');

const base = createCrudController(attendanceService, 'Attendance');

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
		const teacher = await Teacher.findOne({ userId: req.user._id }).select('_id');
		if (!teacher) {
			return res.json({ success: true, data: [] });
		}

		const timetables = await Timetable.find({ 'schedule.teacherId': teacher._id }).select('classId');
		const classIds = timetables.map((item) => item.classId).filter(Boolean);
		const filter = classIds.length
			? { $or: [{ markedBy: teacher._id }, { classId: { $in: classIds } }] }
			: { markedBy: teacher._id };

		const data = await attendanceService.findAll(filter);
		return res.json({ success: true, data });
	}

	return res.status(403).json({ success: false, message: 'Forbidden' });
});

module.exports = { ...base, list };