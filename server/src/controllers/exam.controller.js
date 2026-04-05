const createCrudController = require('./crud.controller.factory');
const asyncHandler = require('../middleware/async.middleware');
const examService = require('../services/exam.service');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');

const base = createCrudController(examService, 'Exam');

const getTeacherScope = async (userId) => {
	const teacher = await Teacher.findOne({ userId }).select('classIds subjects');
	if (!teacher) {
		return { classIds: [], subjectIds: [] };
	}

	return {
		classIds: Array.isArray(teacher.classIds) ? teacher.classIds.filter(Boolean) : [],
		subjectIds: Array.isArray(teacher.subjects) ? teacher.subjects.filter(Boolean) : []
	};
};

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
		const { classIds, subjectIds } = await getTeacherScope(req.user._id);
		if (classIds.length === 0 || subjectIds.length === 0) {
			return res.json({ success: true, data: [] });
		}

		const data = await examService.findAll({ classId: { $in: classIds }, subjectId: { $in: subjectIds } });
		return res.json({ success: true, data });
	}

	return res.status(403).json({ success: false, message: 'Forbidden' });
});

const get = asyncHandler(async (req, res) => {
	const item = await examService.findById(req.params.id);
	if (!item) {
		return res.status(404).json({ success: false, message: 'Exam not found' });
	}

	if (req.user?.role === 'admin') {
		return res.json({ success: true, data: item });
	}

	if (req.user?.role === 'student') {
		const student = await Student.findOne({ userId: req.user._id }).select('classId');
		if (student?.classId && String(student.classId) === String(item.classId?._id || item.classId || '')) {
			return res.json({ success: true, data: item });
		}
		return res.status(403).json({ success: false, message: 'Forbidden' });
	}

	if (req.user?.role === 'teacher') {
		const { classIds, subjectIds } = await getTeacherScope(req.user._id);
		const classSet = new Set(classIds.map((value) => String(value || '')));
		const subjectSet = new Set(subjectIds.map((value) => String(value || '')));

		const hasAccess =
			classSet.has(String(item.classId?._id || item.classId || '')) &&
			subjectSet.has(String(item.subjectId?._id || item.subjectId || ''));

		if (hasAccess) {
			return res.json({ success: true, data: item });
		}

		return res.status(403).json({ success: false, message: 'Forbidden' });
	}

	return res.status(403).json({ success: false, message: 'Forbidden' });
});

const create = asyncHandler(async (req, res) => {
	if (req.user?.role === 'teacher') {
		const { classIds, subjectIds } = await getTeacherScope(req.user._id);
		const classSet = new Set(classIds.map((value) => String(value || '')));
		const subjectSet = new Set(subjectIds.map((value) => String(value || '')));

		if (!classSet.has(String(req.body.classId || '')) || !subjectSet.has(String(req.body.subjectId || ''))) {
			return res.status(403).json({ success: false, message: 'You can only create exams for assigned class-subject combinations' });
		}
	}

	const item = await examService.create({
		...req.body,
		examName: req.body?.examName || req.body?.description || 'Exam',
		examDate: req.body?.examDate || req.body?.date,
		createdBy: req.user?._id
	});
	return res.status(201).json({ success: true, data: item });
});

const update = asyncHandler(async (req, res) => {
	const existing = await examService.findById(req.params.id);
	if (!existing) {
		return res.status(404).json({ success: false, message: 'Exam not found' });
	}

	if (req.user?.role === 'teacher') {
		const { classIds, subjectIds } = await getTeacherScope(req.user._id);
		const classSet = new Set(classIds.map((value) => String(value || '')));
		const subjectSet = new Set(subjectIds.map((value) => String(value || '')));

		const existingClassId = String(existing.classId?._id || existing.classId || '');
		const existingSubjectId = String(existing.subjectId?._id || existing.subjectId || '');

		if (!classSet.has(existingClassId) || !subjectSet.has(existingSubjectId)) {
			return res.status(403).json({ success: false, message: 'Forbidden' });
		}

		const nextClassId = req.body.classId !== undefined ? String(req.body.classId || '') : existingClassId;
		const nextSubjectId = req.body.subjectId !== undefined ? String(req.body.subjectId || '') : existingSubjectId;

		if (!classSet.has(nextClassId) || !subjectSet.has(nextSubjectId)) {
			return res.status(403).json({ success: false, message: 'You can only update exams for assigned class-subject combinations' });
		}
	}

	const item = await examService.updateById(req.params.id, req.body);
	return res.json({ success: true, data: item });
});

module.exports = { ...base, list, get, create, update };