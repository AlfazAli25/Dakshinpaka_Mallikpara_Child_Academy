const asyncHandler = require('../middleware/async.middleware');
const Student = require('../models/student.model');
const Fee = require('../models/fee.model');
const feeService = require('../services/fee.service');
const attendanceService = require('../services/attendance.service');
const gradeService = require('../services/grade.service');
const studentService = require('../services/student.service');

const getStudentRecord = async (userId) => {
	const student = await Student.findOne({ userId });
	if (!student) {
		const error = new Error('Student record not found');
		error.statusCode = 404;
		throw error;
	}

	return student;
};

const ensurePendingFeeLedger = async (student) => {
	const configuredPending = Math.max(Number(student?.pendingFees || 0), 0);
	if (configuredPending <= 0) {
		return;
	}

	const existing = await Fee.findOne({ studentId: student._id });
	if (existing) {
		return;
	}

	await Fee.create({
		studentId: student._id,
		dueDate: new Date(),
		amountDue: configuredPending,
		amountPaid: 0,
		status: 'PENDING'
	});
};

const getProfile = asyncHandler(async (req, res) => {
	const student = await studentService.findByUserId(req.user._id);
	if (!student) {
		return res.status(404).json({ success: false, message: 'Student record not found' });
	}

	return res.json({ success: true, data: student });
});

const getFees = asyncHandler(async (req, res) => {
	const student = await getStudentRecord(req.user._id);
	await ensurePendingFeeLedger(student);
	const data = await feeService.findAll({ studentId: student._id });
	return res.json({ success: true, data });
});

const getAttendance = asyncHandler(async (req, res) => {
	const student = await getStudentRecord(req.user._id);
	const data = await attendanceService.findAll({ studentId: student._id });
	return res.json({ success: true, data });
});

const getResults = asyncHandler(async (req, res) => {
	const student = await getStudentRecord(req.user._id);
	const data = await gradeService.findAll({ studentId: student._id });
	return res.json({ success: true, data });
});

module.exports = {
	getProfile,
	getFees,
	getAttendance,
	getResults
};
