const createCrudController = require('./crud.controller.factory');
const asyncHandler = require('../middleware/async.middleware');
const teacherService = require('../services/teacher.service');

const base = createCrudController(teacherService, 'Teacher');

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

const sendTeacherList = async ({ req, res, filter }) => {
	const query = req.query || {};
	const pagination = parsePagination(query);

	if (!pagination.hasPagination) {
		const data = await teacherService.findAll(filter);
		return res.json({ success: true, data });
	}

	const [data, total] = await Promise.all([
		teacherService.findAll(filter),
		teacherService.countDocuments(filter)
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
	if (req.user?.role === 'admin') {
		return sendTeacherList({ req, res, filter: req.query || {} });
	}

	if (req.user?.role === 'teacher') {
		return sendTeacherList({ req, res, filter: { ...(req.query || {}), userId: req.user._id } });
	}

	return res.status(403).json({ success: false, message: 'Forbidden' });
});

const getMyProfile = asyncHandler(async (req, res) => {
	const teacher = await teacherService.findByUserId(req.user._id);
	if (!teacher) {
		return res.status(404).json({ success: false, message: 'Teacher record not found' });
	}

	return res.json({ success: true, data: teacher });
});

const getAdminProfile = asyncHandler(async (req, res) => {
	const profile = await teacherService.getAdminProfile(req.params.id);
	res.json({ success: true, data: profile });
});

module.exports = { ...base, list, getMyProfile, getAdminProfile };