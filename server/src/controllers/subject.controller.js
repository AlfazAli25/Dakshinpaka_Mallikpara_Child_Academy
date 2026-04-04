const createCrudController = require('./crud.controller.factory');
const asyncHandler = require('../middleware/async.middleware');
const subjectService = require('../services/subject.service');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');

const base = createCrudController(subjectService, 'Subject');

const list = asyncHandler(async (req, res) => {
	if (req.user?.role === 'admin') {
		const data = await subjectService.findAll(req.query || {});
		return res.json({ success: true, data });
	}

	if (req.user?.role === 'teacher') {
		const teacher = await Teacher.findOne({ userId: req.user._id }).select('classIds subjects');
		const classIds = Array.isArray(teacher?.classIds) ? teacher.classIds.filter(Boolean) : [];
		const subjectIds = Array.isArray(teacher?.subjects) ? teacher.subjects.filter(Boolean) : [];

		if (classIds.length === 0 && subjectIds.length === 0) {
			return res.json({ success: true, data: [] });
		}

		const filter = subjectIds.length > 0 ? { _id: { $in: subjectIds } } : { classId: { $in: classIds } };
		const data = await subjectService.findAll(filter);
		return res.json({ success: true, data });
	}

	if (req.user?.role === 'student') {
		const student = await Student.findOne({ userId: req.user._id }).select('classId');
		if (!student?.classId) {
			return res.json({ success: true, data: [] });
		}

		const data = await subjectService.findAll({ classId: student.classId });
		return res.json({ success: true, data });
	}

	return res.status(403).json({ success: false, message: 'Forbidden' });
});

const get = asyncHandler(async (req, res) => {
	const item = await subjectService.findById(req.params.id);
	if (!item) {
		return res.status(404).json({ success: false, message: 'Subject not found' });
	}

	if (req.user?.role === 'admin') {
		return res.json({ success: true, data: item });
	}

	if (req.user?.role === 'teacher') {
		const teacher = await Teacher.findOne({ userId: req.user._id }).select('classIds subjects');
		const classIds = new Set((teacher?.classIds || []).map((value) => String(value || '')));
		const subjectIds = new Set((teacher?.subjects || []).map((value) => String(value || '')));

		const subjectClassId = String(item.classId?._id || item.classId || '');
		if (subjectIds.has(String(item._id)) || classIds.has(subjectClassId)) {
			return res.json({ success: true, data: item });
		}

		return res.status(403).json({ success: false, message: 'Forbidden' });
	}

	if (req.user?.role === 'student') {
		const student = await Student.findOne({ userId: req.user._id }).select('classId');
		if (student?.classId && String(student.classId) === String(item.classId?._id || item.classId || '')) {
			return res.json({ success: true, data: item });
		}
		return res.status(403).json({ success: false, message: 'Forbidden' });
	}

	return res.status(403).json({ success: false, message: 'Forbidden' });
});

module.exports = { ...base, list, get };