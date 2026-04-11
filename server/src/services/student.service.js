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
const { uploadStudentPhoto } = require('./cloudinary.service');

const base = createCrudService(Student);

const STUDENT_POPULATE = [
	{ path: 'userId', select: 'name email role' },
	{ path: 'classId', select: 'name section' }
];
const STUDENT_LIST_SELECT = 'userId admissionNo rollNo profileImageUrl classId guardianContact pendingFees attendance createdAt';

const withSession = (query, session) => (session ? query.session(session) : query);
const DEFAULT_STUDENT_PROFILE_IMAGE_URL = '/default-student-avatar.svg';
const STUDENT_FALLBACK_EMAIL_DOMAIN = 'student.local';

const generateFallbackStudentEmail = async () => {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const candidate = `student.${new mongoose.Types.ObjectId().toString()}@${STUDENT_FALLBACK_EMAIL_DOMAIN}`;
		const existing = await User.findOne({ email: candidate }).select('_id').lean();
		if (!existing) {
			return candidate;
		}
	}

	const error = new Error('Unable to generate a unique student email. Please try again.');
	error.statusCode = 500;
	throw error;
};

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

const generateStudentAdmissionNo = async () => {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const suffix = `${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;
		const candidate = `STU-${suffix}`;
		const existing = await Student.findOne({ admissionNo: candidate }).select('_id').lean();
		if (!existing) {
			return candidate;
		}
	}

	const error = new Error('Unable to generate a unique Student ID. Please try again.');
	error.statusCode = 500;
	throw error;
};

const uploadStudentPhotoIfProvided = async (studentPhotoFile) => {
	if (!studentPhotoFile?.buffer) {
		return null;
	}

	try {
		return await uploadStudentPhoto({
			buffer: studentPhotoFile.buffer,
			mimeType: studentPhotoFile.mimetype,
			originalName: studentPhotoFile.originalname
		});
	} catch (error) {
		if (!error.statusCode || error.statusCode >= 500) {
			error.statusCode = 502;
			error.message = 'Failed to upload student photo to storage provider';
		}
		throw error;
	}
};

const findAll = (filter = {}) => base.findAll({ select: STUDENT_LIST_SELECT, ...filter }, STUDENT_POPULATE);
const findById = (id) => base.findById(id, STUDENT_POPULATE);
const findByUserId = (userId) => Student.findOne({ userId }).populate(STUDENT_POPULATE).lean();

const findAllForAdmin = async ({ search, page, limit } = {}) => {
	const normalizedSearch = String(search || '').trim();
	const safePage = toPositiveInt(page, 1);
	const safeLimit = Math.min(toPositiveInt(limit, 20), 200);
	const hasPagination = page !== undefined || limit !== undefined;
	const skip = (safePage - 1) * safeLimit;

	let linkedFilter = {};
	let matchingStudentUserIds = [];

	if (normalizedSearch) {
		const admissionExactFilter = { admissionNo: normalizedSearch };
		const [matchingUsers, admissionMatchCount] = await Promise.all([
			User.find({ role: 'student', name: { $regex: normalizedSearch, $options: 'i' } }).select('_id').lean(),
			Student.countDocuments(admissionExactFilter)
		]);

		matchingStudentUserIds = matchingUsers.map((item) => item._id).filter(Boolean);

		if (admissionMatchCount > 0) {
			linkedFilter = admissionExactFilter;
		} else {
			linkedFilter = matchingStudentUserIds.length > 0 ? { userId: { $in: matchingStudentUserIds } } : { _id: null };
		}
	}

	const linkedQuery = Student.find(linkedFilter)
		.select(STUDENT_LIST_SELECT)
		.populate({ path: 'userId', select: 'name email role createdAt' })
		.populate({ path: 'classId', select: 'name section' })
		.sort({ createdAt: -1 });

	if (hasPagination) {
		linkedQuery.skip(skip).limit(safeLimit);
	}

	const [linkedRows, linkedTotal] = await Promise.all([
		linkedQuery.lean(),
		Student.countDocuments(linkedFilter)
	]);

	if (linkedRows.length > 0 || normalizedSearch || hasPagination) {
		const data = linkedRows.map((item) => ({
			...item,
			isLinkedRecord: true
		}));

		if (!hasPagination) {
			return data;
		}

		return {
			data,
			pagination: {
				page: safePage,
				limit: safeLimit,
				total: linkedTotal,
				totalPages: linkedTotal === 0 ? 0 : Math.ceil(linkedTotal / safeLimit)
			}
		};
	}

	const unlinkedFilter = {
		role: 'student',
		...(normalizedSearch
			? {
				name: { $regex: normalizedSearch, $options: 'i' }
			}
			: {})
	};
	const unlinkedQuery = User.find(unlinkedFilter)
		.select('name email role createdAt')
		.sort({ createdAt: -1 });

	if (hasPagination) {
		unlinkedQuery.skip(skip).limit(safeLimit);
	}

	const unlinkedUsers = await unlinkedQuery.lean();

	const data = unlinkedUsers.map((user) => ({
		_id: `user-${String(user._id || '')}`,
		userId: user,
		admissionNo: '-',
		rollNo: '-',
		profileImageUrl: DEFAULT_STUDENT_PROFILE_IMAGE_URL,
		classId: null,
		guardianContact: '-',
		pendingFees: 0,
		attendance: 0,
		isLinkedRecord: false
	}));

	if (!hasPagination) {
		return data;
	}

	const unlinkedTotal = await User.countDocuments(unlinkedFilter);
	return {
		data,
		pagination: {
			page: safePage,
			limit: safeLimit,
			total: unlinkedTotal,
			totalPages: unlinkedTotal === 0 ? 0 : Math.ceil(unlinkedTotal / safeLimit)
		}
	};
};

const create = async (payload) => {
	const {
		name,
		email,
		password,
		classId,
		rollNo,
		gender,
		dob,
		guardianContact,
		address,
		pendingFees,
		attendance,
		studentPhotoFile
	} = payload;
	const normalizedEmail = String(email || '').toLowerCase().trim();
	const hasProvidedEmail = Boolean(normalizedEmail);
	const normalizedGender = String(gender || '').toUpperCase().trim();
	const normalizedClassId = String(classId || '').trim();
	const hasClassId = Boolean(normalizedClassId);
	const hasProvidedRollNo = rollNo !== undefined && rollNo !== null && String(rollNo).trim() !== '';
	const requestedRollNo = hasProvidedRollNo ? Number(rollNo) : null;
	const normalizedGuardianContact = String(guardianContact || '').trim();
	const normalizedAddress = String(address || '').trim();
	const pendingFeesProvided =
		pendingFees !== undefined && pendingFees !== null && String(pendingFees).trim() !== '';
	const normalizedPendingFees =
		pendingFees === undefined || pendingFees === null || String(pendingFees).trim() === '' ? 0 : Number(pendingFees);
	const attendanceProvided =
		attendance !== undefined && attendance !== null && String(attendance).trim() !== '';
	const normalizedAttendance = attendanceProvided ? Number(attendance) : 0;
	const dobProvided = dob !== undefined && dob !== null && String(dob).trim() !== '';
	const parsedDob = dobProvided ? new Date(dob) : null;

	let normalizedRollNo = null;
	if (hasProvidedRollNo) {
		normalizedRollNo = requestedRollNo;
	}

	if (
		!name ||
		!password ||
		!normalizedGuardianContact
	) {
		const error = new Error(
			'All required student details are: name, guardian contact, and password'
		);
		error.statusCode = 400;
		throw error;
	}

	if (hasProvidedRollNo && (!Number.isInteger(normalizedRollNo) || normalizedRollNo <= 0)) {
		const error = new Error('Roll number must be a positive whole number');
		error.statusCode = 400;
		throw error;
	}

	if (!Number.isFinite(normalizedPendingFees) || normalizedPendingFees < 0) {
		const error = new Error('Pending fees must be 0 or greater');
		error.statusCode = 400;
		throw error;
	}

	if (attendanceProvided && (!Number.isFinite(normalizedAttendance) || normalizedAttendance < 0 || normalizedAttendance > 100)) {
		const error = new Error('Attendance must be between 0 and 100');
		error.statusCode = 400;
		throw error;
	}

	if (normalizedGender && !['MALE', 'FEMALE', 'OTHER'].includes(normalizedGender)) {
		const error = new Error('Gender must be MALE, FEMALE, or OTHER');
		error.statusCode = 400;
		throw error;
	}

	if (parsedDob && (Number.isNaN(parsedDob.getTime()) || parsedDob > new Date())) {
		const error = new Error('Please enter a valid date of birth');
		error.statusCode = 400;
		throw error;
	}

	if (hasClassId && !mongoose.Types.ObjectId.isValid(normalizedClassId)) {
		const error = new Error('Invalid class selected');
		error.statusCode = 400;
		throw error;
	}

	if (!hasProvidedRollNo) {
		if (hasClassId) {
			const highestRollNoStudent = await Student.findOne({ classId: normalizedClassId })
				.select('rollNo')
				.sort({ rollNo: -1 })
				.lean();
			const highestRollNo = Number(highestRollNoStudent?.rollNo);
			normalizedRollNo = Number.isInteger(highestRollNo) && highestRollNo > 0 ? highestRollNo + 1 : 1;
		} else {
			normalizedRollNo = Math.max(1, Math.floor(Date.now() / 1000));
		}
	}

	if (hasProvidedEmail) {
		if (!isValidEmail(normalizedEmail)) {
			const error = new Error('Please enter a valid email address.');
			error.statusCode = 400;
			throw error;
		}

		const existingEmail = await User.findOne({ email: normalizedEmail }).select('_id').lean();
		if (existingEmail) {
			const error = new Error('Email already in use');
			error.statusCode = 409;
			throw error;
		}
	}

	if (hasClassId) {
		const existingRollNo = await Student.findOne({ classId: normalizedClassId, rollNo: normalizedRollNo }).select('_id').lean();
		if (existingRollNo) {
			const error = new Error('Roll number already exists in this class');
			error.statusCode = 409;
			throw error;
		}
	}

	const emailForLogin = hasProvidedEmail ? normalizedEmail : await generateFallbackStudentEmail();

	const passwordHash = await bcrypt.hash(password, 10);
	const user = await User.create({
		name: String(name).trim(),
		email: emailForLogin,
		passwordHash,
		role: 'student'
	});

	try {
		const generatedAdmissionNo = await generateStudentAdmissionNo();
		const uploadedStudentPhoto = await uploadStudentPhotoIfProvided(studentPhotoFile);

		const student = await Student.create({
			userId: user._id,
			admissionNo: generatedAdmissionNo,
			rollNo: normalizedRollNo,
			profileImageUrl: uploadedStudentPhoto?.secureUrl || DEFAULT_STUDENT_PROFILE_IMAGE_URL,
			profileImagePublicId: uploadedStudentPhoto?.publicId || undefined,
			classId: hasClassId ? normalizedClassId : undefined,
			gender: normalizedGender || undefined,
			dob: parsedDob || undefined,
			guardianContact: normalizedGuardianContact,
			address: normalizedAddress || undefined,
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

		if (error?.code === 11000 && error?.keyPattern?.rollNo) {
			const conflictError = new Error('Roll number already exists in this class');
			conflictError.statusCode = 409;
			throw conflictError;
		}

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
	const hasIncomingRollNo = payload.rollNo !== undefined;
	const currentRollNo = Number(student.rollNo);
	const hasCurrentRollNo = Number.isInteger(currentRollNo) && currentRollNo > 0;
	const nextRollNoRaw = hasIncomingRollNo ? Number(payload.rollNo) : currentRollNo;
	const hasNextRollNo = Number.isInteger(nextRollNoRaw) && nextRollNoRaw > 0;
	const nextRollNo = hasNextRollNo ? Math.floor(nextRollNoRaw) : null;
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

	if (hasIncomingRollNo && !hasNextRollNo) {
		const error = new Error('Roll number must be a positive whole number');
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
		const existingAdmissionNo = await Student.findOne({ admissionNo: nextAdmissionNo, _id: { $ne: student._id } })
			.select('_id')
			.lean();
		if (existingAdmissionNo) {
			const error = new Error('Admission number already in use');
			error.statusCode = 409;
			throw error;
		}
	}

	const currentClassId = student.classId ? String(student.classId) : '';
	const nextClassIdValue = nextClassId ? String(nextClassId) : '';
	const classChanged = nextClassIdValue !== currentClassId;
	if ((hasIncomingRollNo || classChanged) && (hasCurrentRollNo || hasIncomingRollNo) && nextClassIdValue) {
		const existingRollNoInClass = await Student.findOne({
			classId: nextClassId,
			rollNo: nextRollNo,
			_id: { $ne: student._id }
		})
			.select('_id')
			.lean();
		if (existingRollNoInClass) {
			const error = new Error('Roll number already exists in this class');
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

		const existingEmail = await User.findOne({ email: normalizedEmail, _id: { $ne: student.userId } }).select('_id').lean();
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
		const studentUpdates = {
			admissionNo: nextAdmissionNo,
			classId: nextClassId,
			gender: nextGender,
			dob: nextDob,
			guardianContact: nextGuardianContact,
			address: nextAddress,
			pendingFees: nextPendingFees
		};

		if (hasIncomingRollNo && nextRollNo !== null) {
			studentUpdates.rollNo = nextRollNo;
		}

		await withSession(
			Student.findByIdAndUpdate(
				student._id,
				studentUpdates,
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
	const user = await User.findById(userId).select('name email role').lean();
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
				rollNo: '-',
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