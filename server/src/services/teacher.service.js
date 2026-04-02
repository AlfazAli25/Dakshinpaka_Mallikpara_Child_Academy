const bcrypt = require('bcryptjs');
const Teacher = require('../models/teacher.model');
const User = require('../models/user.model');
const Payroll = require('../models/payroll.model');
const Receipt = require('../models/receipt.model');
const Timetable = require('../models/timetable.model');
const Attendance = require('../models/attendance.model');
const createCrudService = require('./crud.service');
const { isValidEmail } = require('../utils/validation');

const base = createCrudService(Teacher);

const findAll = (filter = {}) => base.findAll(filter, 'userId subjects');
const findById = (id) => base.findById(id, 'userId subjects');
const findByUserId = (userId) => Teacher.findOne({ userId }).populate('userId subjects');

const create = async (payload) => {
	const { name, email, password, teacherId, subjects, department, qualifications, joiningDate } = payload;
	const normalizedEmail = String(email || '').toLowerCase().trim();
	const normalizedDepartment = String(department || '').trim();
	const normalizedQualifications = String(qualifications || '').trim();
	const normalizedSubjects = Array.isArray(subjects) ? subjects.filter(Boolean) : [];
	const parsedJoiningDate = new Date(joiningDate);

	if (!name || !email || !password || !teacherId || !normalizedDepartment || !normalizedQualifications || !joiningDate || normalizedSubjects.length === 0) {
		const error = new Error('All teacher details are required: name, email, password, teacher ID, department, qualifications, joining date, and subjects');
		error.statusCode = 400;
		throw error;
	}

	if (Number.isNaN(parsedJoiningDate.getTime())) {
		const error = new Error('Please enter a valid joining date');
		error.statusCode = 400;
		throw error;
	}

	if (!isValidEmail(normalizedEmail)) {
		const error = new Error('Please enter a valid email address.');
		error.statusCode = 400;
		throw error;
	}

	const existingEmail = await User.findOne({ email: normalizedEmail });
	if (existingEmail) {
		const error = new Error('Email already in use');
		error.statusCode = 409;
		throw error;
	}

	const existingTeacherId = await Teacher.findOne({ teacherId: String(teacherId).trim() });
	if (existingTeacherId) {
		const error = new Error('Teacher ID already in use');
		error.statusCode = 409;
		throw error;
	}

	const passwordHash = await bcrypt.hash(password, 10);
	const user = await User.create({
		name: String(name).trim(),
		email: normalizedEmail,
		passwordHash,
		role: 'teacher'
	});

	try {
		const teacher = await Teacher.create({
			userId: user._id,
			teacherId: String(teacherId).trim(),
			subjects: normalizedSubjects,
			department: normalizedDepartment,
			qualifications: normalizedQualifications,
			joiningDate: parsedJoiningDate
		});

		return Teacher.findById(teacher._id).populate('userId subjects');
	} catch (error) {
		await User.findByIdAndDelete(user._id);
		throw error;
	}
};

const updateById = async (id, payload = {}) => {
	const teacher = await Teacher.findById(id);
	if (!teacher) {
		return null;
	}

	const nextTeacherId =
		payload.teacherId !== undefined ? String(payload.teacherId || '').trim() : String(teacher.teacherId || '').trim();
	const nextDepartment =
		payload.department !== undefined ? String(payload.department || '').trim() : String(teacher.department || '').trim();
	const nextQualifications =
		payload.qualifications !== undefined
			? String(payload.qualifications || '').trim()
			: String(teacher.qualifications || '').trim();
	const nextSubjects =
		payload.subjects !== undefined ? (Array.isArray(payload.subjects) ? payload.subjects.filter(Boolean) : []) : teacher.subjects || [];
	const nextJoiningDateRaw = payload.joiningDate !== undefined ? payload.joiningDate : teacher.joiningDate;
	const nextJoiningDate = nextJoiningDateRaw ? new Date(nextJoiningDateRaw) : null;

	if (!nextTeacherId || !nextDepartment || !nextQualifications || !nextJoiningDate || nextSubjects.length === 0) {
		const error = new Error('Teacher profile must keep all mandatory fields complete');
		error.statusCode = 400;
		throw error;
	}

	if (Number.isNaN(nextJoiningDate.getTime())) {
		const error = new Error('Please enter a valid joining date');
		error.statusCode = 400;
		throw error;
	}

	if (nextTeacherId !== String(teacher.teacherId || '').trim()) {
		const existingTeacherId = await Teacher.findOne({ teacherId: nextTeacherId, _id: { $ne: teacher._id } });
		if (existingTeacherId) {
			const error = new Error('Teacher ID already in use');
			error.statusCode = 409;
			throw error;
		}
	}

	const userUpdates = {};
	if (payload.name !== undefined) {
		const normalizedName = String(payload.name || '').trim();
		if (!normalizedName) {
			const error = new Error('Name cannot be empty');
			error.statusCode = 400;
			throw error;
		}
		userUpdates.name = normalizedName;
	}

	if (payload.email !== undefined) {
		const normalizedEmail = String(payload.email || '').toLowerCase().trim();
		if (!isValidEmail(normalizedEmail)) {
			const error = new Error('Please enter a valid email address.');
			error.statusCode = 400;
			throw error;
		}

		const existingEmail = await User.findOne({ email: normalizedEmail, _id: { $ne: teacher.userId } });
		if (existingEmail) {
			const error = new Error('Email already in use');
			error.statusCode = 409;
			throw error;
		}

		userUpdates.email = normalizedEmail;
	}

	if (payload.password !== undefined) {
		if (String(payload.password || '').length < 6) {
			const error = new Error('Password must be at least 6 characters');
			error.statusCode = 400;
			throw error;
		}
		userUpdates.passwordHash = await bcrypt.hash(String(payload.password), 10);
	}

	await Teacher.findByIdAndUpdate(
		teacher._id,
		{
			teacherId: nextTeacherId,
			subjects: nextSubjects,
			department: nextDepartment,
			qualifications: nextQualifications,
			joiningDate: nextJoiningDate
		},
		{ new: true, runValidators: true }
	);

	if (teacher.userId && Object.keys(userUpdates).length > 0) {
		await User.findByIdAndUpdate(teacher.userId, userUpdates, { new: true, runValidators: true });
	}

	return Teacher.findById(teacher._id).populate('userId subjects');
};

const getAdminProfile = async (teacherId) => {
	const teacher = await Teacher.findById(teacherId).populate('userId subjects');
	if (!teacher) {
		const error = new Error('Teacher not found');
		error.statusCode = 404;
		throw error;
	}

	const salaryHistory = await Payroll.find({ teacherId: teacher._id })
		.populate('processedByAdmin', 'name email')
		.populate('receiptId')
		.sort({ createdAt: -1 });
	const receipts = await Receipt.find({ teacherId: teacher._id, receiptType: 'SALARY' }).sort({ createdAt: -1 });

	const totals = salaryHistory.reduce(
		(acc, item) => {
			if (item.status === 'Paid') {
				acc.totalPaid += item.amount || 0;
			} else {
				acc.totalPending += item.amount || 0;
			}
			return acc;
		},
		{ totalPaid: 0, totalPending: 0 }
	);

	return {
		teacher,
		salaryHistory,
		receipts,
		salaryStatus: {
			...totals,
			state: totals.totalPending > 0 ? 'PENDING' : 'PAID'
		}
	};
};

const deleteById = async (id) => {
	const teacher = await Teacher.findById(id);
	if (!teacher) {
		return null;
	}

	await Promise.all([
		Payroll.deleteMany({ teacherId: teacher._id }),
		Receipt.deleteMany({ teacherId: teacher._id }),
		Attendance.updateMany({ markedBy: teacher._id }, { $unset: { markedBy: 1 } }),
		Timetable.updateMany(
			{ 'schedule.teacherId': teacher._id },
			{ $pull: { schedule: { teacherId: teacher._id } } }
		)
	]);

	await Teacher.findByIdAndDelete(teacher._id);
	if (teacher.userId) {
		await User.findByIdAndDelete(teacher.userId);
	}

	return teacher;
};

module.exports = { ...base, findAll, findById, findByUserId, create, updateById, getAdminProfile, deleteById };