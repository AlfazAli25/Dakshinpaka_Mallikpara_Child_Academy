const createCrudController = require('./crud.controller.factory');
const asyncHandler = require('../middleware/async.middleware');
const studentService = require('../services/student.service');
const { ensureMonthlyFeesForStudent } = require('../services/monthly-fee-ledger.service');
const Teacher = require('../models/teacher.model');

const base = createCrudController(studentService, 'Student');

const list = asyncHandler(async (req, res) => {
	const query = req.query || {};
	const requestedClassId = String(query.classId || '').trim();
	const queryWithoutClassId = { ...query };
	delete queryWithoutClassId.classId;

	if (req.user?.role === 'admin') {
		const filter = requestedClassId ? { ...queryWithoutClassId, classId: requestedClassId } : queryWithoutClassId;
		const data = await studentService.findAll(filter);
		return res.json({ success: true, data });
	}

	if (req.user?.role === 'student') {
		const data = await studentService.findAll({ userId: req.user._id });
		return res.json({ success: true, data });
	}

	if (req.user?.role === 'teacher') {
		const teacher = await Teacher.findOne({ userId: req.user._id }).select('classIds');
		const assignedClassIds = (Array.isArray(teacher?.classIds) ? teacher.classIds : [])
			.map((value) => String(value || ''))
			.filter(Boolean);

		if (assignedClassIds.length === 0) {
			return res.json({ success: true, data: [] });
		}

		const assignedClassSet = new Set(assignedClassIds);
		if (requestedClassId && !assignedClassSet.has(requestedClassId)) {
			return res.status(403).json({ success: false, message: 'Forbidden' });
		}

		const filter = requestedClassId
			? { ...queryWithoutClassId, classId: requestedClassId }
			: { ...queryWithoutClassId, classId: { $in: assignedClassIds } };
		const data = await studentService.findAll(filter);
		return res.json({ success: true, data });
	}

	return res.status(403).json({ success: false, message: 'Forbidden' });
});

const getMyProfile = asyncHandler(async (req, res) => {
	const student = await studentService.findByUserId(req.user._id);
	if (!student) {
		return res.status(404).json({ success: false, message: 'Student record not found' });
	}

	await ensureMonthlyFeesForStudent({ studentId: student._id });
	const refreshedStudent = await studentService.findByUserId(req.user._id);

	return res.json({ success: true, data: refreshedStudent || student });
});

const listAllForAdmin = asyncHandler(async (req, res) => {
	const data = await studentService.findAllForAdmin({ search: req.query?.search });
	res.json({ success: true, data });
});

const listByClass = asyncHandler(async (req, res) => {
	const classId = String(req.params.classId || '');

	if (req.user?.role === 'admin') {
		const data = await studentService.findAll({ classId });
		return res.json({ success: true, data });
	}

	if (req.user?.role === 'teacher') {
		const teacher = await Teacher.findOne({ userId: req.user._id }).select('classIds');
		const classSet = new Set((teacher?.classIds || []).map((value) => String(value || '')));
		if (!classSet.has(classId)) {
			return res.status(403).json({ success: false, message: 'Forbidden' });
		}

		const data = await studentService.findAll({ classId });
		return res.json({ success: true, data });
	}

	return res.status(403).json({ success: false, message: 'Forbidden' });
});

const getAdminProfile = asyncHandler(async (req, res) => {
	const profile = await studentService.getAdminProfile(req.params.id);
	res.json({ success: true, data: profile });
});

const getAdminProfileByUserId = asyncHandler(async (req, res) => {
	const profile = await studentService.getAdminProfileByUserId(req.params.userId);
	res.json({ success: true, data: profile });
});

const removeByUserId = asyncHandler(async (req, res) => {
	const removed = await studentService.deleteByUserId(req.params.userId);
	if (!removed) {
		return res.status(404).json({ success: false, message: 'Student account not found' });
	}

	return res.json({ success: true, message: 'Student deleted successfully' });
});

module.exports = {
	...base,
	list,
	listByClass,
	getMyProfile,
	listAllForAdmin,
	getAdminProfile,
	getAdminProfileByUserId,
	removeByUserId
};