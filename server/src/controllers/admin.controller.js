const asyncHandler = require('../middleware/async.middleware');
const studentService = require('../services/student.service');
const teacherService = require('../services/teacher.service');

const registerStudent = asyncHandler(async (req, res) => {
	const student = await studentService.create(req.body);
	res.status(201).json({ success: true, data: student, message: 'Student registered successfully' });
});

const registerTeacher = asyncHandler(async (req, res) => {
	const teacher = await teacherService.create(req.body);
	res.status(201).json({ success: true, data: teacher, message: 'Teacher registered successfully' });
});

module.exports = {
	registerStudent,
	registerTeacher
};
