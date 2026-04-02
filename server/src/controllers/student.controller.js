const createCrudController = require('./crud.controller.factory');
const asyncHandler = require('../middleware/async.middleware');
const studentService = require('../services/student.service');

const base = createCrudController(studentService, 'Student');

const list = asyncHandler(async (req, res) => {
	if (req.user?.role === 'admin') {
		const data = await studentService.findAll(req.query || {});
		return res.json({ success: true, data });
	}

	if (req.user?.role === 'student') {
		const data = await studentService.findAll({ userId: req.user._id });
		return res.json({ success: true, data });
	}

	return res.status(403).json({ success: false, message: 'Forbidden' });
});

const getMyProfile = asyncHandler(async (req, res) => {
	const student = await studentService.findByUserId(req.user._id);
	if (!student) {
		return res.status(404).json({ success: false, message: 'Student record not found' });
	}

	return res.json({ success: true, data: student });
});

const listAllForAdmin = asyncHandler(async (req, res) => {
	const data = await studentService.findAllForAdmin({ search: req.query?.search });
	res.json({ success: true, data });
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
	getMyProfile,
	listAllForAdmin,
	getAdminProfile,
	getAdminProfileByUserId,
	removeByUserId
};