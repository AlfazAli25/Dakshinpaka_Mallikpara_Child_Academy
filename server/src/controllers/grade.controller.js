const createCrudController = require('./crud.controller.factory');
const asyncHandler = require('../middleware/async.middleware');
const gradeService = require('../services/grade.service');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');
const Exam = require('../models/exam.model');

const base = createCrudController(gradeService, 'Grade');

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
		const { classIds, subjectIds } = await getTeacherScope(req.user._id);
		if (classIds.length === 0 || subjectIds.length === 0) {
			return res.json({ success: true, data: [] });
		}

		const examIds = (await Exam.find({ classId: { $in: classIds }, subjectId: { $in: subjectIds } }).select('_id')).map((item) => item._id);
		if (examIds.length === 0) {
			return res.json({ success: true, data: [] });
		}

		const data = await gradeService.findAll({ examId: { $in: examIds } });
		return res.json({ success: true, data });
	}

	return res.status(403).json({ success: false, message: 'Forbidden' });
});

const get = asyncHandler(async (req, res) => {
	const item = await gradeService.findById(req.params.id);
	if (!item) {
		return res.status(404).json({ success: false, message: 'Grade not found' });
	}

	if (req.user?.role === 'admin') {
		return res.json({ success: true, data: item });
	}

	if (req.user?.role === 'student') {
		const student = await Student.findOne({ userId: req.user._id }).select('_id');
		if (student?._id && String(student._id) === String(item.studentId?._id || item.studentId || '')) {
			return res.json({ success: true, data: item });
		}
		return res.status(403).json({ success: false, message: 'Forbidden' });
	}

	if (req.user?.role === 'teacher') {
		const exam = await Exam.findById(item.examId?._id || item.examId).select('classId subjectId');
		if (!exam) {
			return res.status(404).json({ success: false, message: 'Exam not found for this grade' });
		}

		const { classIds, subjectIds } = await getTeacherScope(req.user._id);
		const classSet = new Set(classIds.map((value) => String(value || '')));
		const subjectSet = new Set(subjectIds.map((value) => String(value || '')));

		const hasAccess =
			classSet.has(String(exam.classId || '')) &&
			subjectSet.has(String(exam.subjectId || ''));

		if (hasAccess) {
			return res.json({ success: true, data: item });
		}
		return res.status(403).json({ success: false, message: 'Forbidden' });
	}

	return res.status(403).json({ success: false, message: 'Forbidden' });
});

const create = asyncHandler(async (req, res) => {
	if (req.user?.role === 'teacher') {
		const exam = await Exam.findById(req.body.examId).select('classId subjectId');
		if (!exam) {
			return res.status(400).json({ success: false, message: 'Invalid exam selected' });
		}

		const { classIds, subjectIds } = await getTeacherScope(req.user._id);
		const classSet = new Set(classIds.map((value) => String(value || '')));
		const subjectSet = new Set(subjectIds.map((value) => String(value || '')));

		if (!classSet.has(String(exam.classId || '')) || !subjectSet.has(String(exam.subjectId || ''))) {
			return res.status(403).json({ success: false, message: 'You can only create grades for assigned class-subject combinations' });
		}
	}

	const item = await gradeService.create(req.body);
	return res.status(201).json({ success: true, data: item });
});

const update = asyncHandler(async (req, res) => {
	const existing = await gradeService.findById(req.params.id);
	if (!existing) {
		return res.status(404).json({ success: false, message: 'Grade not found' });
	}

	if (req.user?.role === 'teacher') {
		const { classIds, subjectIds } = await getTeacherScope(req.user._id);
		const classSet = new Set(classIds.map((value) => String(value || '')));
		const subjectSet = new Set(subjectIds.map((value) => String(value || '')));

		const currentExam = await Exam.findById(existing.examId?._id || existing.examId).select('classId subjectId');
		if (!currentExam) {
			return res.status(400).json({ success: false, message: 'Invalid exam selected' });
		}

		if (!classSet.has(String(currentExam.classId || '')) || !subjectSet.has(String(currentExam.subjectId || ''))) {
			return res.status(403).json({ success: false, message: 'Forbidden' });
		}

		if (req.body.examId) {
			const nextExam = await Exam.findById(req.body.examId).select('classId subjectId');
			if (!nextExam) {
				return res.status(400).json({ success: false, message: 'Invalid exam selected' });
			}

			if (!classSet.has(String(nextExam.classId || '')) || !subjectSet.has(String(nextExam.subjectId || ''))) {
				return res.status(403).json({ success: false, message: 'You can only update grades for assigned class-subject combinations' });
			}
		}
	}

	const item = await gradeService.updateById(req.params.id, req.body);
	return res.json({ success: true, data: item });
});

module.exports = { ...base, list, get, create, update };