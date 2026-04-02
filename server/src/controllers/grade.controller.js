const createCrudController = require('./crud.controller.factory');
const asyncHandler = require('../middleware/async.middleware');
const gradeService = require('../services/grade.service');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');
const Exam = require('../models/exam.model');

const base = createCrudController(gradeService, 'Grade');

const list = asyncHandler(async (req, res) => {
	if (req.user?.role === 'admin') {
		const data = await gradeService.findAll(req.query || {});
		return res.json({ success: true, data });
	}

	if (req.user?.role === 'student') {
		const student = await Student.findOne({ userId: req.user._id }).select('_id');
		if (!student) {
			return res.json({ success: true, data: [] });
		}

		const data = await gradeService.findAll({ studentId: student._id });
		return res.json({ success: true, data });
	}

	if (req.user?.role === 'teacher') {
		const teacher = await Teacher.findOne({ userId: req.user._id }).select('subjects');
		const subjectIds = Array.isArray(teacher?.subjects) ? teacher.subjects.filter(Boolean) : [];
		if (subjectIds.length === 0) {
			return res.json({ success: true, data: [] });
		}

		const examIds = (await Exam.find({ subjectId: { $in: subjectIds } }).select('_id')).map((item) => item._id);
		if (examIds.length === 0) {
			return res.json({ success: true, data: [] });
		}

		const data = await gradeService.findAll({ examId: { $in: examIds } });
		return res.json({ success: true, data });
	}

	return res.status(403).json({ success: false, message: 'Forbidden' });
});

module.exports = { ...base, list };