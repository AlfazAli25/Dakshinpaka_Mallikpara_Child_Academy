const mongoose = require('mongoose');
const Timetable = require('../models/timetable.model');
const ClassModel = require('../models/class.model');
const Subject = require('../models/subject.model');
const Teacher = require('../models/teacher.model');
const User = require('../models/user.model');

const TIMETABLE_POPULATE = [
	{ path: 'classId', select: 'name section' },
	{ path: 'subjectId', select: 'name code classId teacherId' },
	{ path: 'teacherId', select: 'name email role' },
	{ path: 'createdBy', select: 'name email role' }
];

const TIMETABLE_DAYS = Array.isArray(Timetable.TIMETABLE_DAYS)
	? Timetable.TIMETABLE_DAYS
	: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const MIN_PERIOD_NUMBER = Number(Timetable.MIN_PERIOD_NUMBER || 1);
const MAX_PERIOD_NUMBER = Number(Timetable.MAX_PERIOD_NUMBER || 8);
const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const DAY_ORDER = new Map(TIMETABLE_DAYS.map((day, index) => [day, index]));
const DAY_BY_LOWER = TIMETABLE_DAYS.reduce((acc, day) => {
	acc[String(day || '').toLowerCase()] = day;
	return acc;
}, {});

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const toIdString = (value) => String(value?._id || value || '');

const createHttpError = (statusCode, message) => {
	const error = new Error(message);
	error.statusCode = statusCode;
	return error;
};

const isMongoDuplicateKeyError = (error) => Number(error?.code || 0) === 11000;

const parseTimeToMinutes = (value) => {
	if (!TIME_24H_REGEX.test(String(value || ''))) {
		return Number.NaN;
	}

	const [hours, minutes] = String(value).split(':').map((item) => Number(item));
	return (hours * 60) + minutes;
};

const normalizeSection = (value) => String(value || '').trim().toUpperCase();

const normalizeDay = (value) => {
	const normalized = String(value || '').trim().toLowerCase();
	return DAY_BY_LOWER[normalized] || '';
};

const normalizeTime = (value) => String(value || '').trim();

const normalizePayload = (payload = {}) => {
	const rawPeriodNumber = Number(payload.periodNumber);

	return {
		classId: toIdString(payload.classId),
		section: normalizeSection(payload.section),
		day: normalizeDay(payload.day),
		periodNumber: Number.isFinite(rawPeriodNumber) ? Math.trunc(rawPeriodNumber) : Number.NaN,
		subjectId: toIdString(payload.subjectId),
		teacherId: toIdString(payload.teacherId),
		startTime: normalizeTime(payload.startTime),
		endTime: normalizeTime(payload.endTime),
		roomNumber: String(payload.roomNumber || '').trim()
	};
};

const ensureObjectId = (value, fieldLabel) => {
	if (!mongoose.Types.ObjectId.isValid(value)) {
		throw createHttpError(400, `${fieldLabel} is invalid`);
	}
};

const validateNormalizedPayload = (payload = {}) => {
	const {
		classId,
		section,
		day,
		periodNumber,
		subjectId,
		teacherId,
		startTime,
		endTime
	} = payload;

	ensureObjectId(classId, 'Class');
	ensureObjectId(subjectId, 'Subject');
	ensureObjectId(teacherId, 'Teacher');

	if (!section) {
		throw createHttpError(400, 'Section is required');
	}

	if (!day || !TIMETABLE_DAYS.includes(day)) {
		throw createHttpError(400, `Day must be one of: ${TIMETABLE_DAYS.join(', ')}`);
	}

	if (!Number.isInteger(periodNumber) || periodNumber < MIN_PERIOD_NUMBER || periodNumber > MAX_PERIOD_NUMBER) {
		throw createHttpError(400, `Period number must be between ${MIN_PERIOD_NUMBER} and ${MAX_PERIOD_NUMBER}`);
	}

	if (!TIME_24H_REGEX.test(startTime) || !TIME_24H_REGEX.test(endTime)) {
		throw createHttpError(400, 'Start time and end time must be in HH:mm format');
	}

	const startMinutes = parseTimeToMinutes(startTime);
	const endMinutes = parseTimeToMinutes(endTime);
	if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || startMinutes >= endMinutes) {
		throw createHttpError(400, 'Start time must be before end time');
	}
};

const mapDuplicateTimetableError = (error) => {
	if (!isMongoDuplicateKeyError(error)) {
		return null;
	}

	const keyPattern = error?.keyPattern || {};
	const duplicateKeys = Object.keys(keyPattern).map((key) => String(key || '').toLowerCase());
	const message = String(error?.message || '').toLowerCase();

	if (
		duplicateKeys.includes('teacherid') ||
		(message.includes('teacherid_1') && message.includes('day_1') && message.includes('starttime_1'))
	) {
		return createHttpError(409, 'Teacher already assigned at this time');
	}

	if (
		duplicateKeys.includes('classid') ||
		(message.includes('classid_1') && message.includes('section_1') && message.includes('day_1') && message.includes('periodnumber_1'))
	) {
		return createHttpError(409, 'This class period already has a timetable entry');
	}

	return createHttpError(409, 'Duplicate timetable entry found');
};

const sortRowsByDayAndPeriod = (rows = []) => {
	const cloned = Array.isArray(rows) ? [...rows] : [];

	cloned.sort((left, right) => {
		const dayOrderLeft = DAY_ORDER.get(String(left?.day || ''));
		const dayOrderRight = DAY_ORDER.get(String(right?.day || ''));
		const dayRankLeft = Number.isInteger(dayOrderLeft) ? dayOrderLeft : 999;
		const dayRankRight = Number.isInteger(dayOrderRight) ? dayOrderRight : 999;

		if (dayRankLeft !== dayRankRight) {
			return dayRankLeft - dayRankRight;
		}

		const periodLeft = Number(left?.periodNumber || 0);
		const periodRight = Number(right?.periodNumber || 0);
		if (periodLeft !== periodRight) {
			return periodLeft - periodRight;
		}

		const startTimeLeft = String(left?.startTime || '');
		const startTimeRight = String(right?.startTime || '');
		return startTimeLeft.localeCompare(startTimeRight);
	});

	return cloned;
};

const parsePagination = (query = {}) => {
	const hasPage = query.page !== undefined || query._page !== undefined;
	const hasLimit = query.limit !== undefined || query._limit !== undefined;

	if (!hasPage && !hasLimit) {
		return null;
	}

	const rawPage = Number(query.page ?? query._page ?? DEFAULT_PAGE);
	const rawLimit = Number(query.limit ?? query._limit ?? DEFAULT_LIMIT);

	const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : DEFAULT_PAGE;
	const limit = Number.isFinite(rawLimit) && rawLimit > 0
		? Math.min(Math.floor(rawLimit), MAX_LIMIT)
		: DEFAULT_LIMIT;

	const skip = (page - 1) * limit;

	return { page, limit, skip };
};

const ensureClassExists = async (classId) => {
	const classRecord = await ClassModel.findById(classId).select('_id section').lean();
	if (!classRecord) {
		throw createHttpError(404, 'Class not found');
	}
	return classRecord;
};

const resolveTeacherUserId = async (teacherIdOrUserId) => {
	ensureObjectId(teacherIdOrUserId, 'Teacher');

	const teacherUser = await User.findById(teacherIdOrUserId).select('_id role').lean();
	if (teacherUser) {
		if (teacherUser.role !== 'teacher') {
			throw createHttpError(400, 'Teacher must be a user with teacher role');
		}

		return toIdString(teacherUser._id);
	}

	const teacherProfile = await Teacher.findById(teacherIdOrUserId).select('userId').lean();
	if (!teacherProfile?.userId) {
		throw createHttpError(404, 'Teacher not found');
	}

	const linkedUser = await User.findById(teacherProfile.userId).select('_id role').lean();
	if (!linkedUser || linkedUser.role !== 'teacher') {
		throw createHttpError(400, 'Teacher must be a user with teacher role');
	}

	return toIdString(linkedUser._id);
};

const ensureTeacherAssignedToSubject = async ({ teacherUserId, subject }) => {
	const normalizedSubjectTeacherId = toIdString(subject?.teacherId);
	const normalizedSubjectId = toIdString(subject?._id);

	if (normalizedSubjectTeacherId) {
		if (normalizedSubjectTeacherId !== teacherUserId) {
			throw createHttpError(400, 'Teacher is not assigned to this subject');
		}
		return;
	}

	const teacherProfile = await Teacher.findOne({ userId: teacherUserId }).select('subjects').lean();
	const assignedSubjectIds = new Set((teacherProfile?.subjects || []).map((item) => toIdString(item)).filter(Boolean));
	if (!assignedSubjectIds.has(normalizedSubjectId)) {
		throw createHttpError(400, 'Teacher is not assigned to this subject');
	}
};

const enforceSlotBusinessRules = async (normalizedPayload, { excludeId } = {}) => {
	const {
		classId,
		section,
		day,
		periodNumber,
		subjectId,
		teacherId,
		startTime
	} = normalizedPayload;

	await ensureClassExists(classId);

	const [subject, teacherUser] = await Promise.all([
		Subject.findById(subjectId).select('_id classId teacherId').lean(),
		User.findById(teacherId).select('_id role').lean()
	]);

	if (!subject) {
		throw createHttpError(404, 'Subject not found');
	}

	if (toIdString(subject.classId) !== classId) {
		throw createHttpError(400, 'Selected subject does not belong to this class');
	}

	if (!teacherUser || teacherUser.role !== 'teacher') {
		throw createHttpError(400, 'Teacher not found');
	}

	await ensureTeacherAssignedToSubject({
		teacherUserId: teacherId,
		subject
	});

	const [duplicateClassPeriod, teacherConflict] = await Promise.all([
		Timetable.findOne({
			classId,
			section,
			day,
			periodNumber,
			...(excludeId ? { _id: { $ne: excludeId } } : {})
		})
			.select('_id')
			.lean(),
		Timetable.findOne({
			teacherId,
			day,
			startTime,
			...(excludeId ? { _id: { $ne: excludeId } } : {})
		})
			.select('_id')
			.lean()
	]);

	if (duplicateClassPeriod) {
		throw createHttpError(409, 'This class period already has a timetable entry');
	}

	if (teacherConflict) {
		throw createHttpError(409, 'Teacher already assigned at this time');
	}
};

const getById = async (id) => Timetable.findById(id).populate(TIMETABLE_POPULATE).lean();

const createEntry = async ({ payload = {}, createdBy = null } = {}) => {
	const normalizedPayload = normalizePayload(payload);
	normalizedPayload.teacherId = await resolveTeacherUserId(normalizedPayload.teacherId);

	validateNormalizedPayload(normalizedPayload);
	await enforceSlotBusinessRules(normalizedPayload);

	try {
		const created = await Timetable.create({
			...normalizedPayload,
			...(createdBy ? { createdBy } : {})
		});

		return getById(created._id);
	} catch (error) {
		throw mapDuplicateTimetableError(error) || error;
	}
};

const updateEntry = async ({ id, payload = {} } = {}) => {
	ensureObjectId(id, 'Timetable entry');

	const existing = await Timetable.findById(id).lean();
	if (!existing) {
		return null;
	}

	const normalizedPayload = normalizePayload({
		classId: payload.classId !== undefined ? payload.classId : existing.classId,
		section: payload.section !== undefined ? payload.section : existing.section,
		day: payload.day !== undefined ? payload.day : existing.day,
		periodNumber: payload.periodNumber !== undefined ? payload.periodNumber : existing.periodNumber,
		subjectId: payload.subjectId !== undefined ? payload.subjectId : existing.subjectId,
		teacherId: payload.teacherId !== undefined ? payload.teacherId : existing.teacherId,
		startTime: payload.startTime !== undefined ? payload.startTime : existing.startTime,
		endTime: payload.endTime !== undefined ? payload.endTime : existing.endTime,
		roomNumber: payload.roomNumber !== undefined ? payload.roomNumber : existing.roomNumber
	});

	normalizedPayload.teacherId = await resolveTeacherUserId(normalizedPayload.teacherId);

	validateNormalizedPayload(normalizedPayload);
	await enforceSlotBusinessRules(normalizedPayload, { excludeId: id });

	try {
		await Timetable.findByIdAndUpdate(id, normalizedPayload, { new: true, runValidators: true });
		return getById(id);
	} catch (error) {
		throw mapDuplicateTimetableError(error) || error;
	}
};

const deleteEntry = async (id) => {
	ensureObjectId(id, 'Timetable entry');
	return Timetable.findByIdAndDelete(id).lean();
};

const listByClass = async ({ classId, section, day, periodNumber, query = {} } = {}) => {
	ensureObjectId(classId, 'Class');

	const normalizedSection = section !== undefined ? normalizeSection(section) : '';
	const normalizedDay = day !== undefined ? normalizeDay(day) : '';

	if (day !== undefined && !normalizedDay) {
		throw createHttpError(400, `Day must be one of: ${TIMETABLE_DAYS.join(', ')}`);
	}

	const normalizedPeriodNumber = periodNumber !== undefined ? Number(periodNumber) : null;
	if (periodNumber !== undefined && (!Number.isFinite(normalizedPeriodNumber) || normalizedPeriodNumber < MIN_PERIOD_NUMBER || normalizedPeriodNumber > MAX_PERIOD_NUMBER)) {
		throw createHttpError(400, `Period number must be between ${MIN_PERIOD_NUMBER} and ${MAX_PERIOD_NUMBER}`);
	}

	const filter = {
		classId
	};

	if (normalizedSection) {
		filter.section = normalizedSection;
	}

	if (normalizedDay) {
		filter.day = normalizedDay;
	}

	if (normalizedPeriodNumber !== null) {
		filter.periodNumber = Math.trunc(normalizedPeriodNumber);
	}

	const pagination = parsePagination(query);

	if (!pagination) {
		const rows = await Timetable.find(filter)
			.populate(TIMETABLE_POPULATE)
			.lean();

		return {
			data: sortRowsByDayAndPeriod(rows),
			pagination: null
		};
	}

	const [total, rows] = await Promise.all([
		Timetable.countDocuments(filter),
		Timetable.find(filter)
			.populate(TIMETABLE_POPULATE)
			.skip(pagination.skip)
			.limit(pagination.limit)
			.lean()
	]);

	return {
		data: sortRowsByDayAndPeriod(rows),
		pagination: {
			page: pagination.page,
			limit: pagination.limit,
			total,
			totalPages: Math.ceil(total / pagination.limit) || 0
		}
	};
};

const listByTeacher = async ({ teacherId, classId, section, day, startTime, query = {} } = {}) => {
	const teacherUserId = await resolveTeacherUserId(teacherId);
	const normalizedSection = section !== undefined ? normalizeSection(section) : '';
	const normalizedDay = day !== undefined ? normalizeDay(day) : '';
	const normalizedStartTime = startTime !== undefined ? normalizeTime(startTime) : '';

	if (day !== undefined && !normalizedDay) {
		throw createHttpError(400, `Day must be one of: ${TIMETABLE_DAYS.join(', ')}`);
	}

	if (startTime !== undefined && !TIME_24H_REGEX.test(normalizedStartTime)) {
		throw createHttpError(400, 'Start time must be in HH:mm format');
	}

	const filter = {
		teacherId: teacherUserId
	};

	if (classId !== undefined && String(classId || '').trim()) {
		ensureObjectId(classId, 'Class');
		filter.classId = classId;
	}

	if (normalizedSection) {
		filter.section = normalizedSection;
	}

	if (normalizedDay) {
		filter.day = normalizedDay;
	}

	if (normalizedStartTime) {
		filter.startTime = normalizedStartTime;
	}

	const pagination = parsePagination(query);

	if (!pagination) {
		const rows = await Timetable.find(filter)
			.populate(TIMETABLE_POPULATE)
			.lean();

		return {
			data: sortRowsByDayAndPeriod(rows),
			pagination: null,
			teacherUserId
		};
	}

	const [total, rows] = await Promise.all([
		Timetable.countDocuments(filter),
		Timetable.find(filter)
			.populate(TIMETABLE_POPULATE)
			.skip(pagination.skip)
			.limit(pagination.limit)
			.lean()
	]);

	return {
		data: sortRowsByDayAndPeriod(rows),
		pagination: {
			page: pagination.page,
			limit: pagination.limit,
			total,
			totalPages: Math.ceil(total / pagination.limit) || 0
		},
		teacherUserId
	};
};

module.exports = {
	TIMETABLE_DAYS,
	MIN_PERIOD_NUMBER,
	MAX_PERIOD_NUMBER,
	createEntry,
	listByClass,
	listByTeacher,
	updateEntry,
	deleteEntry,
	getById,
	createHttpError,
	normalizeSection,
	normalizeDay,
	parseTimeToMinutes,
	resolveTeacherUserId
};