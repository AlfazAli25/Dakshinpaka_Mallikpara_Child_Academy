const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Student = require('../models/student.model');
const User = require('../models/user.model');
const Fee = require('../models/fee.model');
const Payment = require('../models/payment.model');
const Receipt = require('../models/receipt.model');
const Notification = require('../models/notification.model');
const Attendance = require('../models/attendance.model');
const Grade = require('../models/grade.model');
const Marks = require('../models/marks.model');
const createCrudService = require('./crud.service');
const { isValidEmail } = require('../utils/validation');
const { ensureMonthlyFeesForStudent, applyManualPendingFeesOverride } = require('./monthly-fee-ledger.service');

const base = createCrudService(Student);

const STUDENT_POPULATE = [
	{ path: 'userId', select: 'name email role' },
	{ path: 'classId', select: 'name section' }
];

const withSession = (query, session) => (session ? query.session(session) : query);

const runWithOptionalTransaction = async (handler) => {
	const session = await mongoose.startSession();
	try {
		let result;
		try {
			await session.withTransaction(async () => {
				result = await handler(session);
			});
			return result;
		} catch (error) {
			const message = String(error?.message || '');
			const transactionUnsupported =
				message.includes('Transaction numbers are only allowed') ||
				message.includes('replica set') ||
				message.includes('NoSuchTransaction');

			if (!transactionUnsupported) {
				throw error;
			}

			return handler(null);
		}
	} finally {
		await session.endSession();
	}
};

const toPositiveInt = (value, fallback) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}

	return Math.floor(parsed);
};

const findAll = (filter = {}) => base.findAll(filter, STUDENT_POPULATE);
const findById = (id) => base.findById(id, STUDENT_POPULATE);
const findByUserId = (userId) => Student.findOne({ userId }).populate(STUDENT_POPULATE).lean();

const findAllForAdmin = async ({ search, page, limit } = {}) => {
	const [students, studentUsers] = await Promise.all([
		Student.find({})
			.select('userId admissionNo classId guardianContact pendingFees attendance createdAt')
			.populate({ path: 'userId', select: 'name email role' })
			.populate({ path: 'classId', select: 'name section' })
			.sort({ createdAt: -1 })
			.lean(),
		User.find({ role: 'student' }).select('name email role createdAt').sort({ createdAt: -1 }).lean()
	]);

	const linkedUserIds = new Set(
		students
			.map((item) => item.userId?._id?.toString())
			.filter(Boolean)
	);

	const unlinkedAccounts = studentUsers
		.filter((user) => !linkedUserIds.has(user._id.toString()))
		.map((user) => ({
			_id: `user-${user._id.toString()}`,
			userId: user,
			admissionNo: '-',
			classId: null,
			guardianContact: '-',
			pendingFees: 0,
			attendance: 0,
			isLinkedRecord: false
		}));

	const linkedRows = students.map((item) => ({
		...item,
		isLinkedRecord: true
	}));

	const mergedRows = [...linkedRows, ...unlinkedAccounts];
	const normalizedSearch = String(search || '').trim().toLowerCase();
	const toPaginatedResult = (items) => {
		const rawPage = page;
		const rawLimit = limit;
		const hasPagination = rawPage !== undefined || rawLimit !== undefined;
		if (!hasPagination) {
			return items;
		}

		const safePage = toPositiveInt(rawPage, 1);
		const safeLimit = Math.min(toPositiveInt(rawLimit, 20), 200);
		const total = items.length;
		const start = (safePage - 1) * safeLimit;
		const end = start + safeLimit;

		return {
			data: items.slice(start, end),
			pagination: {
				page: safePage,
				limit: safeLimit,
				total,
				totalPages: total === 0 ? 0 : Math.ceil(total / safeLimit)
			}
		};
	};

	if (!normalizedSearch) {
		return toPaginatedResult(mergedRows);
	}

	const exactAdmissionMatches = mergedRows.filter(
		(item) => String(item.admissionNo || '').toLowerCase() === normalizedSearch
	);
	if (exactAdmissionMatches.length > 0) {
		return toPaginatedResult(exactAdmissionMatches);
	}

	return toPaginatedResult(
		mergedRows.filter((item) => String(item.userId?.name || '').toLowerCase().includes(normalizedSearch))
	);

};

const create = async (payload) => {
	const { name, email, password, admissionNo, classId, gender, dob, guardianContact, address, pendingFees, attendance } = payload;
	const normalizedEmail = String(email || '').toLowerCase().trim();
	const normalizedGender = String(gender || '').toUpperCase().trim();
	const normalizedGuardianContact = String(guardianContact || '').trim();
	const normalizedAddress = String(address || '').trim();
	const pendingFeesProvided =
		pendingFees !== undefined && pendingFees !== null && String(pendingFees).trim() !== '';
	const normalizedPendingFees =
		pendingFees === undefined || pendingFees === null || String(pendingFees).trim() === '' ? 0 : Number(pendingFees);
	const normalizedAttendance = Number(attendance);
	const parsedDob = new Date(dob);

	if (
		!name ||
		!email ||
		!password ||
		!admissionNo ||
		!classId ||
		!normalizedGender ||
		!dob ||
		!normalizedGuardianContact ||
		!normalizedAddress ||
		attendance === undefined
	) {
		const error = new Error(
			'All student details are required: name, email, password, admission number, class, gender, date of birth, guardian contact, address, and attendance'
		);
		error.statusCode = 400;
		throw error;
	}

	if (!Number.isFinite(normalizedPendingFees) || normalizedPendingFees < 0) {
		const error = new Error('Pending fees must be 0 or greater');
		error.statusCode = 400;
		throw error;
	}

	if (!Number.isFinite(normalizedAttendance) || normalizedAttendance < 0 || normalizedAttendance > 100) {
		const error = new Error('Attendance must be between 0 and 100');
		error.statusCode = 400;
		throw error;
	}

	if (!['MALE', 'FEMALE', 'OTHER'].includes(normalizedGender)) {
		const error = new Error('Gender must be MALE, FEMALE, or OTHER');
		error.statusCode = 400;
		throw error;
	}

	if (Number.isNaN(parsedDob.getTime()) || parsedDob > new Date()) {
		const error = new Error('Please enter a valid date of birth');
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

	const existingAdmissionNo = await Student.findOne({ admissionNo: String(admissionNo).trim() });
	if (existingAdmissionNo) {
		const error = new Error('Admission number already in use');
		error.statusCode = 409;
		throw error;
	}

	const passwordHash = await bcrypt.hash(password, 10);
	const user = await User.create({
		name: String(name).trim(),
		email: normalizedEmail,
		passwordHash,
		role: 'student'
	});

	try {
		const student = await Student.create({
			userId: user._id,
			admissionNo: String(admissionNo).trim(),
			classId,
			gender: normalizedGender,
			dob: parsedDob,
			guardianContact: normalizedGuardianContact,
			address: normalizedAddress,
			pendingFees: normalizedPendingFees,
			attendance: normalizedAttendance
		});

		if (pendingFeesProvided) {
			await applyManualPendingFeesOverride({
				studentId: student._id,
				targetPendingFees: normalizedPendingFees
			});
		} else {
			await ensureMonthlyFeesForStudent({ studentId: student._id });
		}

		return Student.findById(student._id).populate(STUDENT_POPULATE).lean();
	} catch (error) {
		await Student.findOneAndDelete({ userId: user._id });
		await User.findByIdAndDelete(user._id);
		throw error;
	}
};

const updateById = async (id, payload = {}) => {
	const student = await Student.findById(id);
	if (!student) {
		return null;
	}

	if (payload.attendance !== undefined) {
		const error = new Error('Attendance is auto-calculated and cannot be edited manually');
		error.statusCode = 400;
		throw error;
	}

	const pendingFeesProvided = payload.pendingFees !== undefined;

	const nextAdmissionNo =
		payload.admissionNo !== undefined ? String(payload.admissionNo || '').trim() : String(student.admissionNo || '').trim();
	const nextClassId = payload.classId !== undefined ? payload.classId : student.classId;
	const nextGender =
		payload.gender !== undefined ? String(payload.gender || '').toUpperCase().trim() : String(student.gender || '').toUpperCase().trim();
	const nextDobRaw = payload.dob !== undefined ? payload.dob : student.dob;
	const nextDob = nextDobRaw ? new Date(nextDobRaw) : null;
	const nextGuardianContact =
		payload.guardianContact !== undefined
			? String(payload.guardianContact || '').trim()
			: String(student.guardianContact || '').trim();
	const nextAddress =
		payload.address !== undefined ? String(payload.address || '').trim() : String(student.address || '').trim();
	const nextPendingFees = payload.pendingFees !== undefined ? Number(payload.pendingFees) : Number(student.pendingFees ?? 0);

	if (!Number.isFinite(nextPendingFees) || nextPendingFees < 0) {
		const error = new Error('Pending fees must be 0 or greater');
		error.statusCode = 400;
		throw error;
	}

	if (nextGender && !['MALE', 'FEMALE', 'OTHER'].includes(nextGender)) {
		const error = new Error('Gender must be MALE, FEMALE, or OTHER');
		error.statusCode = 400;
		throw error;
	}

	if (nextDob && (Number.isNaN(nextDob.getTime()) || nextDob > new Date())) {
		const error = new Error('Please enter a valid date of birth');
		error.statusCode = 400;
		throw error;
	}

	if (nextAdmissionNo && nextAdmissionNo !== String(student.admissionNo || '').trim()) {
		const existingAdmissionNo = await Student.findOne({ admissionNo: nextAdmissionNo, _id: { $ne: student._id } });
		if (existingAdmissionNo) {
			const error = new Error('Admission number already in use');
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

		const existingEmail = await User.findOne({ email: normalizedEmail, _id: { $ne: student.userId } });
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

	return runWithOptionalTransaction(async (session) => {
		await withSession(
			Student.findByIdAndUpdate(
				student._id,
				{
					admissionNo: nextAdmissionNo,
					classId: nextClassId,
					gender: nextGender,
					dob: nextDob,
					guardianContact: nextGuardianContact,
					address: nextAddress,
					pendingFees: nextPendingFees
				},
				{ new: true, runValidators: true }
			),
			session
		);

		if (student.userId && Object.keys(userUpdates).length > 0) {
			await withSession(User.findByIdAndUpdate(student.userId, userUpdates, { new: true, runValidators: true }), session);
		}

		if (pendingFeesProvided) {
			await applyManualPendingFeesOverride({
				studentId: student._id,
				targetPendingFees: nextPendingFees,
				session
			});
		} else {
			await ensureMonthlyFeesForStudent({ studentId: student._id, session });
		}

		return withSession(Student.findById(student._id).populate(STUDENT_POPULATE).lean(), session);
	});
};

const getAdminProfile = async (studentId) => {
	let student = await Student.findById(studentId).populate(STUDENT_POPULATE).lean();
	if (!student) {
		const error = new Error('Student not found');
		error.statusCode = 404;
		throw error;
	}

	await ensureMonthlyFeesForStudent({ studentId: student._id });
	student = await Student.findById(studentId).populate(STUDENT_POPULATE).lean();
	if (!student) {
		const error = new Error('Student not found');
		error.statusCode = 404;
		throw error;
	}

	const fees = await Fee.find({ studentId: student._id }).sort({ dueDate: -1 }).lean();
	const payments = await Payment.find({ studentId: student._id })
		.populate('processedByAdmin', 'name email')
		.sort({ createdAt: -1 })
		.lean();

	const totals = fees.reduce(
		(acc, item) => {
			acc.totalDue += item.amountDue || 0;
			acc.totalPaid += item.amountPaid || 0;
			return acc;
		},
		{ totalDue: 0, totalPaid: 0 }
	);

	const ledgerPending = Math.max(totals.totalDue - totals.totalPaid, 0);
	const totalPending = ledgerPending;
	const totalDue = totals.totalDue;
	const state = totalPending === 0 && totalDue > 0 ? 'PAID' : totals.totalPaid > 0 ? 'PARTIALLY PAID' : 'PENDING';

	return {
		student,
		fees,
		payments,
		feeStatus: {
			totalDue,
			totalPaid: totals.totalPaid,
			totalPending: totalPending,
			state
		}
	};
};

const getAdminProfileByUserId = async (userId) => {
	const user = await User.findById(userId).select('name email role');
	if (!user || user.role !== 'student') {
		const error = new Error('Student account not found');
		error.statusCode = 404;
		throw error;
	}

	const student = await Student.findOne({ userId: user._id }).populate(STUDENT_POPULATE).lean();
	if (!student) {
		return {
			student: {
				_id: `user-${user._id.toString()}`,
				userId: user,
				admissionNo: '-',
				classId: null,
				guardianContact: '-',
				pendingFees: 0,
				attendance: 0,
				isLinkedRecord: false
			},
			fees: [],
			payments: [],
			feeStatus: {
				totalDue: 0,
				totalPaid: 0,
				totalPending: 0,
				state: 'PENDING'
			}
		};
	}

	return getAdminProfile(student._id);
};

const deleteLinkedStudentData = async (student) => {
	await Promise.all([
		Fee.deleteMany({ studentId: student._id }),
		Payment.deleteMany({ studentId: student._id }),
		Receipt.deleteMany({ studentId: student._id }),
		Notification.deleteMany({ studentId: student._id }),
		Attendance.deleteMany({ studentId: student._id }),
		Grade.deleteMany({ studentId: student._id }),
		Marks.deleteMany({ studentId: student._id })
	]);

	await Student.findByIdAndDelete(student._id);
};

const deleteById = async (id) => {
	const student = await Student.findById(id);
	if (!student) {
		return null;
	}

	await deleteLinkedStudentData(student);
	if (student.userId) {
		await User.findByIdAndDelete(student.userId);
	}

	return student;
};

const deleteByUserId = async (userId) => {
	const user = await User.findById(userId);
	if (!user || user.role !== 'student') {
		return null;
	}

	const student = await Student.findOne({ userId: user._id });
	if (student) {
		await deleteLinkedStudentData(student);
	}

	await User.findByIdAndDelete(user._id);
	return user;
};

module.exports = {
	...base,
	findAll,
	findById,
	findByUserId,
	findAllForAdmin,
	create,
	updateById,
	getAdminProfile,
	getAdminProfileByUserId,
	deleteById,
	deleteByUserId
};