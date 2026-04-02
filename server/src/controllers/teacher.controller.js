const createCrudController = require('./crud.controller.factory');
const asyncHandler = require('../middleware/async.middleware');
const teacherService = require('../services/teacher.service');

const base = createCrudController(teacherService, 'Teacher');

const list = asyncHandler(async (req, res) => {
	if (req.user?.role === 'admin') {
		const data = await teacherService.findAll(req.query || {});
		return res.json({ success: true, data });
	}

	if (req.user?.role === 'teacher') {
		const data = await teacherService.findAll({ userId: req.user._id });
		return res.json({ success: true, data });
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