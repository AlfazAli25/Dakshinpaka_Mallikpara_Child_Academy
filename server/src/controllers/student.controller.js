const createCrudController = require('./crud.controller.factory');
const asyncHandler = require('../middleware/async.middleware');
const studentService = require('../services/student.service');
const { ensureMonthlyFeesForStudent } = require('../services/monthly-fee-ledger.service');
const Teacher = require('../models/teacher.model');

const base = createCrudController(studentService, 'Student');

const toPositiveInt = (value, fallback) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}

	return Math.floor(parsed);
};

const parsePagination = (query = {}) => {
	const rawPage = query.page ?? query._page;
	const rawLimit = query.limit ?? query._limit;
	if (rawPage === undefined && rawLimit === undefined) {
		return { hasPagination: false, page: 1, limit: 0 };
	}

	return {
		hasPagination: true,
		page: toPositiveInt(rawPage, 1),
		limit: Math.min(toPositiveInt(rawLimit, 20), 200)
	};
};

const sendListResponse = async ({ res, filter, query, findMany }) => {
	const pagination = parsePagination(query);
	if (!pagination.hasPagination) {
		const data = await findMany(filter);
		return res.json({ success: true, data });
	}

	const [data, total] = await Promise.all([
		findMany(filter),
		studentService.countDocuments(filter)
	]);

	return res.json({
		success: true,
		data,
		pagination: {
			page: pagination.page,
			limit: pagination.limit,
			total,
			totalPages: total === 0 ? 0 : Math.ceil(total / pagination.limit)
		}
	});
};

const list = asyncHandler(async (req, res) => {
	const query = req.query || {};
	const requestedClassId = String(query.classId || '').trim();
	const queryWithoutClassId = { ...query };
	delete queryWithoutClassId.classId;

	if (req.user?.role === 'admin') {
		const filter = requestedClassId ? { ...queryWithoutClassId, classId: requestedClassId } : queryWithoutClassId;
		return sendListResponse({
			res,
			filter,
			query,
			findMany: studentService.findAll
		});
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
		return sendListResponse({
			res,
			filter,
			query,
			findMany: studentService.findAll
		});
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
	const result = await studentService.findAllForAdmin({
		search: req.query?.search,
		page: req.query?.page ?? req.query?._page,
		limit: req.query?.limit ?? req.query?._limit
	});

	if (Array.isArray(result)) {
		return res.json({ success: true, data: result });
	}

	return res.json({ success: true, data: result.data, pagination: result.pagination });
});

const listByClass = asyncHandler(async (req, res) => {
	const classId = String(req.params.classId || '');

	if (req.user?.role === 'admin') {
		return sendListResponse({
			res,
			filter: { classId, ...(req.query || {}) },
			query: req.query || {},
			findMany: studentService.findAll
		});
	}

	if (req.user?.role === 'teacher') {
		const teacher = await Teacher.findOne({ userId: req.user._id }).select('classIds');
		const classSet = new Set((teacher?.classIds || []).map((value) => String(value || '')));
		if (!classSet.has(classId)) {
			return res.status(403).json({ success: false, message: 'Forbidden' });
		}

		return sendListResponse({
			res,
			filter: { classId, ...(req.query || {}) },
			query: req.query || {},
			findMany: studentService.findAll
		});
	}

	return res.status(403).json({ success: false, message: 'Forbidden' });
});

const create = asyncHandler(async (req, res) => {
	const item = await studentService.create({
		...(req.body || {}),
		studentPhotoFile: req.file || null
	});

	return res.status(201).json({ success: true, data: item });
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
	create,
	list,
	listByClass,
	getMyProfile,
	listAllForAdmin,
	getAdminProfile,
	getAdminProfileByUserId,
	removeByUserId
};