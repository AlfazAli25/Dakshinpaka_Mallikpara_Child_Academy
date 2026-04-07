const createCrudController = require('./crud.controller.factory');
const asyncHandler = require('../middleware/async.middleware');
const classService = require('../services/class.service');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');
const ClassModel = require('../models/class.model');

const base = createCrudController(classService, 'Class');

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

const safeFindClasses = async (filter = {}) => {
	try {
		return await classService.findAll(filter);
	} catch (error) {
		console.error('Class list fallback triggered:', error?.message || error);
		return ClassModel.find(filter).select('name section classTeacher subjectIds').lean();
	}
};

const safeCountClasses = async (filter = {}) => {
	try {
		if (typeof classService.countDocuments === 'function') {
			return await classService.countDocuments(filter);
		}
	} catch (error) {
		console.error('Class count fallback triggered:', error?.message || error);
	}

	const query = { ...(filter || {}) };
	delete query.page;
	delete query.limit;
	delete query._page;
	delete query._limit;
	delete query.sort;
	delete query.order;
	delete query._sort;
	delete query._order;
	delete query.select;
	delete query._select;
	delete query.lean;
	delete query._lean;
	return ClassModel.countDocuments(query);
};

const sendClassList = async ({ req, res, filter }) => {
	const query = req.query || {};
	const pagination = parsePagination(query);

	if (!pagination.hasPagination) {
		const data = await safeFindClasses(filter);
		return res.json({ success: true, data });
	}

	const [data, total] = await Promise.all([
		safeFindClasses(filter),
		safeCountClasses(filter)
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
		return sendClassList({ req, res, filter: req.query || {} });
	}

	if (req.user?.role === 'teacher') {
		const teacher = await Teacher.findOne({ userId: req.user._id }).select('classIds');
		const classIds = Array.isArray(teacher?.classIds) ? teacher.classIds.filter(Boolean) : [];
		if (classIds.length === 0) {
			return res.json({ success: true, data: [] });
		}

		return sendClassList({ req, res, filter: { ...(req.query || {}), _id: { $in: classIds } } });
	}

	if (req.user?.role === 'student') {
		const student = await Student.findOne({ userId: req.user._id }).select('classId');
		if (!student?.classId) {
			return res.json({ success: true, data: [] });
		}

		return sendClassList({ req, res, filter: { ...(req.query || {}), _id: student.classId } });
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