const bcrypt = require('bcryptjs');
const Teacher = require('../models/teacher.model');
const User = require('../models/user.model');
const ClassModel = require('../models/class.model');
const Subject = require('../models/subject.model');
const Payroll = require('../models/payroll.model');
const Receipt = require('../models/receipt.model');
const Timetable = require('../models/timetable.model');
const Attendance = require('../models/attendance.model');
const createCrudService = require('./crud.service');
const { isValidEmail } = require('../utils/validation');
const { ensureMonthlyPayrollForTeacher, applyManualPendingSalaryOverride } = require('./monthly-payroll-ledger.service');

const base = createCrudService(Teacher);

const TEACHER_POPULATE = [
	{ path: 'userId', select: 'name email role' },
	{ path: 'classIds', select: 'name section' },
	{ path: 'subjects', select: 'name code classId' }
];

const CONTACT_NUMBER_REGEX = /^\d{7,15}$/;

const isSyntheticAutoPaidPayrollRow = (row = {}) => {
	if (String(row?.status || '') !== 'Paid') {
		return false;
	}

	const pendingSalaryCleared = Number(row?.pendingSalaryCleared || 0);
	return !row?.paidOn && !row?.processedByAdmin && !row?.receiptId && (!Number.isFinite(pendingSalaryCleared) || pendingSalaryCleared <= 0);
};

const isMongoDuplicateKeyError = (error) => Number(error?.code || 0) === 11000;

const createConflictError = (message) => {
	const error = new Error(message);
	error.statusCode = 409;
	return error;
};

const mapTeacherCreateDuplicateError = (error, { normalizedEmail = '', normalizedTeacherId = '' } = {}) => {
	if (!isMongoDuplicateKeyError(error)) {
		return null;
	}

	const keyPattern = error?.keyPattern || {};
	const keyValue = error?.keyValue || {};
	const duplicateKeys = new Set(
		[
			...Object.keys(keyPattern || {}),
			...Object.keys(keyValue || {})
		].map((key) => String(key || '').toLowerCase())
	);
	const duplicateMessage = String(error?.message || '').toLowerCase();
	const hasMonthContext = duplicateKeys.has('month') || duplicateMessage.includes('month_1');

	if (
		hasMonthContext &&
		(
			duplicateKeys.has('staffid') ||
			duplicateKeys.has('teacherid') ||
			duplicateMessage.includes('index: staffid_1_month_1') ||
			duplicateMessage.includes('index: teacherid_1_month_1')
		)
	) {
		const retryError = new Error('Unable to finalize teacher salary ledger right now. Please try again.');
		retryError.statusCode = 409;
		return retryError;
	}

	const duplicateEmailValue = String(keyValue.email || '').toLowerCase().trim();
	if (
		duplicateKeys.has('email') ||
		duplicateMessage.includes('index: email_1') ||
		(duplicateEmailValue && duplicateEmailValue === normalizedEmail)
	) {
		return createConflictError('Email already in use');
	}

	const duplicateTeacherIdValue = String(keyValue.teacherId || keyValue.teacherid || '').trim();
	if (
		(!hasMonthContext && duplicateKeys.has('teacherid')) ||
		(duplicateMessage.includes('index: teacherid_1') && !duplicateMessage.includes('index: teacherid_1_month_1')) ||
		(duplicateTeacherIdValue && duplicateTeacherIdValue === normalizedTeacherId)
	) {
		return createConflictError('Teacher ID already in use');
	}

	if (duplicateKeys.has('userid') || duplicateMessage.includes('index: userid_1')) {
		return createConflictError('Teacher account already exists for this user');
	}

	return null;
};

const normalizeIdArray = (value) => {
	if (!Array.isArray(value)) {
		return [];
	}

	return Array.from(
		new Set(
			value
				.map((item) => String(item || '').trim())
				.filter(Boolean)
		)
	);
};

const ensureValidContactNumber = (contactNumber) => {
	if (!CONTACT_NUMBER_REGEX.test(contactNumber)) {
		const error = new Error('Contact number must contain only digits (7 to 15 digits)');
		error.statusCode = 400;
		throw error;
	}
};

const withFallbackText = (value, fallback) => {
	const normalized = String(value || '').trim();
	return normalized || fallback;
};

const generateTeacherId = async () => {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const suffix = `${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;
		const candidate = `TCH-${suffix}`;
		const existing = await Teacher.findOne({ teacherId: candidate }).select('_id');
		if (!existing) {
			return candidate;
		}
	}

	const error = new Error('Unable to generate a unique Teacher ID. Please try again.');
	error.statusCode = 500;
	throw error;
};

const deriveClassIdsFromSubjects = async (subjectIds = []) => {
	if (!Array.isArray(subjectIds) || subjectIds.length === 0) {
		return [];
	}

	const subjectRows = await Subject.find({ _id: { $in: subjectIds } }).select('classId');
	const missingClassSubjectIds = subjectRows
		.filter((item) => !item.classId)
		.map((item) => item._id)
		.filter(Boolean);

	const fallbackClassBySubject = new Map();
	if (missingClassSubjectIds.length > 0) {
		const classRows = await ClassModel.find({ subjectIds: { $in: missingClassSubjectIds } }).select('_id subjectIds');
		for (const classRow of classRows) {
			for (const subjectId of classRow.subjectIds || []) {
				const key = String(subjectId || '');
				if (key && !fallbackClassBySubject.has(key)) {
					fallbackClassBySubject.set(key, classRow._id);
				}
			}
		}
	}

	return normalizeIdArray(
		subjectRows.map((item) => item.classId || fallbackClassBySubject.get(String(item._id || '')))
	);
};

const ensureValidAssignments = async ({
	classIds = [],
	subjectIds = [],
	excludeTeacherId = null,
	conflictCheckSubjectIds
}) => {
	let normalizedClassIds = normalizeIdArray(classIds);
	const normalizedSubjectIds = normalizeIdArray(subjectIds);

	if (normalizedClassIds.length === 0 && normalizedSubjectIds.length === 0) {
		return {
			classIds: [],
			subjectIds: []
		};
	}

	let subjectRows = [];
	if (normalizedSubjectIds.length > 0) {
		subjectRows = await Subject.find({ _id: { $in: normalizedSubjectIds } }).select('_id classId name');

		if (subjectRows.length !== normalizedSubjectIds.length) {
			const error = new Error('One or more selected subjects are invalid');
			error.statusCode = 400;
			throw error;
		}

		if (normalizedClassIds.length === 0) {
			normalizedClassIds = await deriveClassIdsFromSubjects(normalizedSubjectIds);
		}
	}

	const classRows = normalizedClassIds.length > 0
		? await ClassModel.find({ _id: { $in: normalizedClassIds } }).select('_id')
		: [];

	if (classRows.length !== normalizedClassIds.length) {
		const error = new Error('One or more selected classes are invalid');
		error.statusCode = 400;
		throw error;
	}

	if (normalizedSubjectIds.length === 0) {
		return {
			classIds: classRows.map((item) => item._id),
			subjectIds: []
		};
	}

	const missingClassSubjectIds = subjectRows
		.filter((item) => !item.classId)
		.map((item) => item._id)
		.filter(Boolean);

	const fallbackClassBySubject = new Map();
	if (missingClassSubjectIds.length > 0) {
		const subjectClassRows = await ClassModel.find({ subjectIds: { $in: missingClassSubjectIds } }).select('_id subjectIds');
		for (const classRow of subjectClassRows) {
			for (const subjectId of classRow.subjectIds || []) {
				const key = String(subjectId || '');
				if (key && !fallbackClassBySubject.has(key)) {
					fallbackClassBySubject.set(key, classRow._id);
				}
			}
		}
	}

	const classSet = new Set(normalizedClassIds);
	const invalidSubject = subjectRows.find((item) => {
		const resolvedClassId = item.classId || fallbackClassBySubject.get(String(item._id || ''));
		return !resolvedClassId || !classSet.has(String(resolvedClassId));
	});
	if (invalidSubject) {
		const error = new Error('Selected subjects must belong to selected classes');
		error.statusCode = 400;
		throw error;
	}

	const normalizedConflictCheckSubjectIds = Array.isArray(conflictCheckSubjectIds)
		? normalizeIdArray(conflictCheckSubjectIds)
		: normalizedSubjectIds;

	if (normalizedConflictCheckSubjectIds.length > 0) {
		const conflictingTeachers = await Teacher.find({
			...(excludeTeacherId ? { _id: { $ne: excludeTeacherId } } : {}),
			subjects: { $in: normalizedConflictCheckSubjectIds }
		}).select('teacherId subjects');

		if (conflictingTeachers.length > 0) {
			const requestedSubjectSet = new Set(normalizedConflictCheckSubjectIds);
			const occupiedSubjectIds = new Set();

			for (const teacherRow of conflictingTeachers) {
				for (const subjectId of teacherRow.subjects || []) {
					const key = String(subjectId || '');
					if (requestedSubjectSet.has(key)) {
						occupiedSubjectIds.add(key);
					}
				}
			}

			const occupiedSubjectNames = subjectRows
				.filter((item) => occupiedSubjectIds.has(String(item._id || '')))
				.map((item) => String(item.name || '').trim())
				.filter(Boolean);

			const messageSuffix = occupiedSubjectNames.length > 0 ? `: ${occupiedSubjectNames.join(', ')}` : '';
			const error = new Error(`Selected subjects are already assigned to another teacher${messageSuffix}`);
			error.statusCode = 409;
			throw error;
		}
	}

	return {
		classIds: classRows.map((item) => item._id),
		subjectIds: subjectRows.map((item) => item._id)
	};
};

const findAll = (filter = {}) => base.findAll(filter, TEACHER_POPULATE);
const findById = (id) => base.findById(id, TEACHER_POPULATE);
const findByUserId = (userId) => Teacher.findOne({ userId }).populate(TEACHER_POPULATE).lean();

const create = async (payload) => {
	const {
		name,
		email,
		password,
		teacherId,
		classIds,
		subjects,
		contactNumber,
		monthlySalary,
		pendingSalary,
		department,
		qualifications,
		joiningDate
	} = payload;
	const normalizedEmail = String(email || '').toLowerCase().trim();
	const requestedTeacherId = String(teacherId || '').trim();
	const normalizedContactNumber = String(contactNumber || '').trim();
	const normalizedMonthlySalary = Number(monthlySalary);
	const normalizedPendingSalary =
		pendingSalary === undefined || pendingSalary === null || String(pendingSalary).trim() === '' ? 0 : Number(pendingSalary);
	const normalizedDepartment = withFallbackText(department, 'Not Assigned');
	const normalizedQualifications = String(qualifications || '').trim();
	const normalizedClassIds = normalizeIdArray(classIds);
	const normalizedSubjects = normalizeIdArray(subjects);
	const parsedJoiningDate = joiningDate ? new Date(joiningDate) : new Date();

	if (
		!name ||
		!email ||
		!password ||
		!normalizedContactNumber ||
		!normalizedQualifications ||
		!Number.isFinite(normalizedMonthlySalary)
	) {
		const error = new Error(
			'All teacher details are required: name, email, password, contact number, qualifications, and monthly salary'
		);
		error.statusCode = 400;
		throw error;
	}

	if (!Number.isFinite(normalizedMonthlySalary) || normalizedMonthlySalary <= 0) {
		const error = new Error('Monthly salary must be greater than zero');
		error.statusCode = 400;
		throw error;
	}

	if (!Number.isFinite(normalizedPendingSalary) || normalizedPendingSalary < 0) {
		const error = new Error('Pending salary must be 0 or greater');
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

	ensureValidContactNumber(normalizedContactNumber);

	const validAssignments = await ensureValidAssignments({
		classIds: normalizedClassIds,
		subjectIds: normalizedSubjects
	});

	const normalizedTeacherId = requestedTeacherId || (await generateTeacherId());

	const existingEmail = await User.findOne({ email: normalizedEmail });
	if (existingEmail) {
		const error = new Error('Email already in use');
		error.statusCode = 409;
		throw error;
	}

	const existingTeacherId = await Teacher.findOne({ teacherId: normalizedTeacherId });
	if (existingTeacherId) {
		const error = new Error('Teacher ID already in use');
		error.statusCode = 409;
		throw error;
	}

	const passwordHash = await bcrypt.hash(password, 10);
	let user;
	try {
		user = await User.create({
			name: String(name).trim(),
			email: normalizedEmail,
			passwordHash,
			role: 'teacher'
		});
	} catch (error) {
		const mappedError = mapTeacherCreateDuplicateError(error, {
			normalizedEmail,
			normalizedTeacherId
		});
		if (mappedError) {
			throw mappedError;
		}

		throw error;
	}

	try {
		const teacher = await Teacher.create({
			userId: user._id,
			teacherId: normalizedTeacherId,
			classIds: validAssignments.classIds,
			subjects: validAssignments.subjectIds,
			contactNumber: normalizedContactNumber,
			monthlySalary: normalizedMonthlySalary,
			pendingSalary: normalizedPendingSalary,
			department: normalizedDepartment,
			qualifications: normalizedQualifications,
			joiningDate: parsedJoiningDate
		});

		if (validAssignments.subjectIds.length > 0) {
			await Subject.updateMany(
				{ _id: { $in: validAssignments.subjectIds } },
				{ $set: { teacherId: user._id } }
			);
		}

		await applyManualPendingSalaryOverride({
			teacherId: teacher._id,
			targetPendingSalary: normalizedPendingSalary,
			monthlyAmount: normalizedMonthlySalary,
			anchorDate: new Date()
		});

		return Teacher.findById(teacher._id).populate(TEACHER_POPULATE).lean();
	} catch (error) {
		await Teacher.findOneAndDelete({ userId: user._id });
		await User.findByIdAndDelete(user._id);

		const mappedError = mapTeacherCreateDuplicateError(error, {
			normalizedEmail,
			normalizedTeacherId
		});
		if (mappedError) {
			throw mappedError;
		}

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
	const nextContactNumber =
		payload.contactNumber !== undefined
			? String(payload.contactNumber || '').trim()
			: String(teacher.contactNumber || '').trim();
	const nextDepartment =
		payload.department !== undefined ? String(payload.department || '').trim() : String(teacher.department || '').trim();
	const nextQualifications =
		payload.qualifications !== undefined
			? String(payload.qualifications || '').trim()
			: String(teacher.qualifications || '').trim();
	const monthlySalaryProvided = payload.monthlySalary !== undefined;
	const pendingSalaryProvided = payload.pendingSalary !== undefined;
	const nextMonthlySalary = monthlySalaryProvided ? Number(payload.monthlySalary) : Number(teacher.monthlySalary || 0);
	const nextPendingSalary = pendingSalaryProvided ? Number(payload.pendingSalary) : Number(teacher.pendingSalary || 0);
	let nextClassIds = payload.classIds !== undefined ? normalizeIdArray(payload.classIds) : normalizeIdArray(teacher.classIds || []);
	const nextSubjects = payload.subjects !== undefined ? normalizeIdArray(payload.subjects) : normalizeIdArray(teacher.subjects || []);
	const currentSubjectSet = new Set(normalizeIdArray(teacher.subjects || []));
	const nextJoiningDateRaw = payload.joiningDate !== undefined ? payload.joiningDate : teacher.joiningDate;
	const nextJoiningDate = nextJoiningDateRaw ? new Date(nextJoiningDateRaw) : null;

	if (nextClassIds.length === 0 && nextSubjects.length > 0) {
		nextClassIds = await deriveClassIdsFromSubjects(nextSubjects);
	}

	if (!nextTeacherId) {
		const error = new Error('Teacher ID is required');
		error.statusCode = 400;
		throw error;
	}

	if (nextJoiningDate && Number.isNaN(nextJoiningDate.getTime())) {
		const error = new Error('Please enter a valid joining date');
		error.statusCode = 400;
		throw error;
	}

	if (monthlySalaryProvided && (!Number.isFinite(nextMonthlySalary) || nextMonthlySalary <= 0)) {
		const error = new Error('Monthly salary must be greater than zero');
		error.statusCode = 400;
		throw error;
	}

	if (pendingSalaryProvided && (!Number.isFinite(nextPendingSalary) || nextPendingSalary < 0)) {
		const error = new Error('Pending salary must be 0 or greater');
		error.statusCode = 400;
		throw error;
	}

	if (nextContactNumber) {
		ensureValidContactNumber(nextContactNumber);
	}

	const validAssignments = await ensureValidAssignments({
		classIds: nextClassIds,
		subjectIds: nextSubjects,
		excludeTeacherId: teacher._id,
		conflictCheckSubjectIds: nextSubjects.filter((subjectId) => !currentSubjectSet.has(subjectId))
	});

	const previousSubjectIds = normalizeIdArray(teacher.subjects || []);
	const previousSubjectIdSet = new Set(previousSubjectIds);
	const nextSubjectIds = normalizeIdArray(validAssignments.subjectIds || []);
	const nextSubjectIdSet = new Set(nextSubjectIds);
	const removedSubjectIds = previousSubjectIds.filter((subjectId) => !nextSubjectIdSet.has(subjectId));
	const addedSubjectIds = nextSubjectIds.filter((subjectId) => !previousSubjectIdSet.has(subjectId));

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

	const teacherUpdates = {
		teacherId: nextTeacherId,
		classIds: validAssignments.classIds,
		subjects: validAssignments.subjectIds,
		contactNumber: nextContactNumber,
		department: nextDepartment,
		qualifications: nextQualifications,
		joiningDate: nextJoiningDate
	};

	if (monthlySalaryProvided) {
		teacherUpdates.monthlySalary = nextMonthlySalary;
	}

	if (pendingSalaryProvided) {
		teacherUpdates.pendingSalary = nextPendingSalary;
	}

	await Teacher.findByIdAndUpdate(teacher._id, teacherUpdates, { new: true, runValidators: true });

	if (teacher.userId && Object.keys(userUpdates).length > 0) {
		await User.findByIdAndUpdate(teacher.userId, userUpdates, { new: true, runValidators: true });
	}

	if (teacher.userId) {
		if (removedSubjectIds.length > 0) {
			await Subject.updateMany(
				{ _id: { $in: removedSubjectIds }, teacherId: teacher.userId },
				{ $unset: { teacherId: 1 } }
			);
		}

		if (addedSubjectIds.length > 0) {
			await Subject.updateMany(
				{ _id: { $in: addedSubjectIds } },
				{ $set: { teacherId: teacher.userId } }
			);
		}
	}

	if (pendingSalaryProvided) {
		await applyManualPendingSalaryOverride({
			teacherId: teacher._id,
			targetPendingSalary: nextPendingSalary,
			monthlyAmount: monthlySalaryProvided ? nextMonthlySalary : undefined,
			anchorDate: new Date()
		});
	} else {
		await ensureMonthlyPayrollForTeacher({
			teacherId: teacher._id,
			monthlyAmount: monthlySalaryProvided ? nextMonthlySalary : undefined
		});
	}

	return Teacher.findById(teacher._id).populate(TEACHER_POPULATE).lean();
};

const getAdminProfile = async (teacherId) => {
	const teacher = await Teacher.findById(teacherId).populate(TEACHER_POPULATE).lean();
	if (!teacher) {
		const error = new Error('Teacher not found');
		error.statusCode = 404;
		throw error;
	}

	await ensureMonthlyPayrollForTeacher({ teacherId: teacher._id });

	const rawSalaryHistory = await Payroll.find({ teacherId: teacher._id })
		.populate('processedByAdmin', 'name email')
		.populate('receiptId')
		.sort({ month: -1, createdAt: -1 })
		.lean();
	const salaryHistory = rawSalaryHistory.filter((item) => !isSyntheticAutoPaidPayrollRow(item));
	const receipts = await Receipt.find({ teacherId: teacher._id, receiptType: 'SALARY' }).sort({ createdAt: -1 }).lean();

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
		Subject.updateMany({ teacherId: teacher.userId }, { $unset: { teacherId: 1 } }),
		Attendance.updateMany({ markedBy: teacher._id }, { $unset: { markedBy: 1 } }),
		ClassModel.updateMany({ classTeacher: teacher._id }, { $unset: { classTeacher: 1 } }),
		Timetable.deleteMany({ teacherId: teacher.userId })
	]);

	await Teacher.findByIdAndDelete(teacher._id);
	if (teacher.userId) {
		await User.findByIdAndDelete(teacher.userId);
	}

	return teacher;
};

module.exports = { ...base, findAll, findById, findByUserId, create, updateById, getAdminProfile, deleteById };