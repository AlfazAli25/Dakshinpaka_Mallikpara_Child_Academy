const createCrudController = require('./crud.controller.factory');
const asyncHandler = require('../middleware/async.middleware');
const examService = require('../services/exam.service');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');

const base = createCrudController(examService, 'Exam');

const list = asyncHandler(async (req, res) => {
	if (req.user?.role === 'admin') {
		const data = await examService.findAll(req.query || {});
		return res.json({ success: true, data });
	}

	if (req.user?.role === 'student') {
		const student = await Student.findOne({ userId: req.user._id }).select('classId');
		if (!student?.classId) {
			return res.json({ success: true, data: [] });
		}

		const data = await examService.findAll({ classId: student.classId });
		return res.json({ success: true, data });
	}

	if (req.user?.role === 'teacher') {
		const teacher = await Teacher.findOne({ userId: req.user._id }).select('subjects');
		const subjectIds = Array.isArray(teacher?.subjects) ? teacher.subjects.filter(Boolean) : [];
		if (subjectIds.length === 0) {
			return res.json({ success: true, data: [] });
		}

		const data = await examService.findAll({ subjectId: { $in: subjectIds } });
		return res.json({ success: true, data });
	}

	return res.status(403).json({ success: false, message: 'Forbidden' });
});

module.exports = { ...base, list };