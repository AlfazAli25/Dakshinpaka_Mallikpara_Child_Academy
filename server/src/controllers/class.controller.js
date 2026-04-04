const createCrudController = require('./crud.controller.factory');
const asyncHandler = require('../middleware/async.middleware');
const classService = require('../services/class.service');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');
const ClassModel = require('../models/class.model');

const base = createCrudController(classService, 'Class');

const safeFindClasses = async (filter = {}) => {
	try {
		return await classService.findAll(filter);
	} catch (error) {
		console.error('Class list fallback triggered:', error?.message || error);
		return ClassModel.find(filter).select('name section classTeacher subjectIds').lean();
	}
};

const safeFindClassById = async (id) => {
	try {
		return await classService.findById(id);
	} catch (error) {
		console.error('Class get fallback triggered:', error?.message || error);
		return ClassModel.findById(id).select('name section classTeacher subjectIds').lean();
	}
};

const list = asyncHandler(async (req, res) => {
	if (req.user?.role === 'admin') {
		const data = await safeFindClasses(req.query || {});
		return res.json({ success: true, data });
	}

	if (req.user?.role === 'teacher') {
		const teacher = await Teacher.findOne({ userId: req.user._id }).select('classIds');
		const classIds = Array.isArray(teacher?.classIds) ? teacher.classIds.filter(Boolean) : [];
		if (classIds.length === 0) {
			return res.json({ success: true, data: [] });
		}

		const data = await safeFindClasses({ _id: { $in: classIds } });
		return res.json({ success: true, data });
	}

	if (req.user?.role === 'student') {
		const student = await Student.findOne({ userId: req.user._id }).select('classId');
		if (!student?.classId) {
			return res.json({ success: true, data: [] });
		}

		const data = await safeFindClasses({ _id: student.classId });
		return res.json({ success: true, data });
	}

	return res.status(403).json({ success: false, message: 'Forbidden' });
});

const get = asyncHandler(async (req, res) => {
	const item = await safeFindClassById(req.params.id);
	if (!item) {
		return res.status(404).json({ success: false, message: 'Class not found' });
	}

	if (req.user?.role === 'admin') {
		return res.json({ success: true, data: item });
	}

	if (req.user?.role === 'teacher') {
		const teacher = await Teacher.findOne({ userId: req.user._id }).select('classIds');
		const classIds = new Set((teacher?.classIds || []).map((value) => String(value || '')));
		if (classIds.has(String(item._id))) {
			return res.json({ success: true, data: item });
		}
		return res.status(403).json({ success: false, message: 'Forbidden' });
	}

	if (req.user?.role === 'student') {
		const student = await Student.findOne({ userId: req.user._id }).select('classId');
		if (student?.classId && String(student.classId) === String(item._id)) {
			return res.json({ success: true, data: item });
		}
		return res.status(403).json({ success: false, message: 'Forbidden' });
	}

	return res.status(403).json({ success: false, message: 'Forbidden' });
});

module.exports = { ...base, list, get };