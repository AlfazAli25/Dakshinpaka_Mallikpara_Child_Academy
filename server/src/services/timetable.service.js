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

const ERROR_MESSAGES = Object.freeze({
	classPeriodConflict: 'Class already has a subject in this period',
	teacherConflict: 'Teacher already assigned to another class',
	subjectPeriodConflict: 'Subject already assigned in this period',
	subjectNotAssignedToTeacher: 'Subject not assigned to teacher',
	duplicateEntry: 'Duplicate timetable entry'
});

let ensureTimetableIndexPromise = null;

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

const hasAllDuplicateKeys = (duplicateKeys, requiredKeys = []) => {
	if (!(duplicateKeys instanceof Set)) {
		return false;
	}

	return requiredKeys.every((key) => duplicateKeys.has(String(key || '').toLowerCase()));
};

const isIgnorableIndexManagementError = (error) => {
	const code = Number(error?.code || 0);
	const codeName = String(error?.codeName || '').toLowerCase();
	const message = String(error?.message || '').toLowerCase();

	if ([13, 26, 27, 68, 85, 86].includes(code)) {
		return true;
	}

	if (['unauthorized', 'indexnotfound', 'indexkeyspecconflict', 'indexoptionsconflict'].includes(codeName)) {
		return true;
	}

	return (
		message.includes('not authorized') ||
		message.includes('index not found') ||
		(message.includes('index') && message.includes('already exists'))
	);
};

const toLowerCaseKeySet = (index = {}) => new Set(
	Object.keys(index?.key || {}).map((key) => String(key || '').toLowerCase())
);

const ensureTimetableIndexes = async () => {
	if (ensureTimetableIndexPromise) {
		return ensureTimetableIndexPromise;
	}

	ensureTimetableIndexPromise = (async () => {
		let indexes = [];

		try {
			indexes = await Timetable.collection.indexes();
		} catch (error) {
			if (!isIgnorableIndexManagementError(error)) {
				throw error;
			}
			return;
		}

		const legacyUniqueIndexes = indexes.filter((index) => {
			if (!index?.unique || !index?.name || !index?.key) {
				return false;
			}

			const keys = toLowerCaseKeySet(index);
			const hasPartialFilter = Boolean(index?.partialFilterExpression);
			const isClassPeriodLegacy = (
				keys.has('classid')
				&& keys.has('periodnumber')
				&& (!keys.has('day') || !keys.has('section'))
			);

			const isClassPeriodPartialLegacy = (
				hasPartialFilter
				&& hasAllDuplicateKeys(keys, ['classid', 'section', 'day', 'periodnumber'])
			);

			const isTeacherTimeLegacy = (
				keys.has('teacherid')
				&& keys.has('starttime')
				&& !keys.has('day')
			);

			const isTeacherTimePartialLegacy = (
				hasPartialFilter
				&& hasAllDuplicateKeys(keys, ['teacherid', 'day', 'starttime'])
			);

			return isClassPeriodLegacy || isClassPeriodPartialLegacy || isTeacherTimeLegacy || isTeacherTimePartialLegacy;
		});

		if (legacyUniqueIndexes.length > 0) {
			for (const index of legacyUniqueIndexes) {
				try {
					await Timetable.collection.dropIndex(index.name);
				} catch (error) {
					if (!isIgnorableIndexManagementError(error)) {
						throw error;
					}
				}
			}

			try {
				indexes = await Timetable.collection.indexes();
			} catch (error) {
				if (!isIgnorableIndexManagementError(error)) {
					throw error;
				}
				return;
			}
		}

		const hasClassSectionDayPeriodUnique = indexes.some((index) => {
			if (!index?.unique) {
				return false;
			}

			const keys = toLowerCaseKeySet(index);
			return (
				hasAllDuplicateKeys(keys, ['classid', 'section', 'day', 'periodnumber'])
				&& !index?.partialFilterExpression
			);
		});

		if (!hasClassSectionDayPeriodUnique) {
			try {
				await Timetable.collection.createIndex(
					{ classId: 1, section: 1, day: 1, periodNumber: 1 },
					{ unique: true, name: 'classId_1_section_1_day_1_periodNumber_1' }
				);
			} catch (error) {
				if (Number(error?.code || 0) !== 11000 && !isIgnorableIndexManagementError(error)) {
					throw error;
				}
			}
		}

		const hasTeacherDayStartUnique = indexes.some((index) => {
			if (!index?.unique) {
				return false;
			}

			const keys = toLowerCaseKeySet(index);
			return hasAllDuplicateKeys(keys, ['teacherid', 'day', 'starttime']) && !index?.partialFilterExpression;
		});

		if (!hasTeacherDayStartUnique) {
			try {
				await Timetable.collection.createIndex(
					{ teacherId: 1, day: 1, startTime: 1 },
					{ unique: true, name: 'teacherId_1_day_1_startTime_1' }
				);
			} catch (error) {
				if (Number(error?.code || 0) !== 11000 && !isIgnorableIndexManagementError(error)) {
					throw error;
				}
			}
		}
	})();

	try {
		await ensureTimetableIndexPromise;
	} catch (error) {
		ensureTimetableIndexPromise = null;
		throw error;
	}
};

const isTeacherTimeOverlap = ({ existingStartTime, existingEndTime, nextStartTime, nextEndTime }) => {
	const existingStartMinutes = parseTimeToMinutes(existingStartTime);
	const existingEndMinutes = parseTimeToMinutes(existingEndTime);
	const nextStartMinutes = parseTimeToMinutes(nextStartTime);
	const nextEndMinutes = parseTimeToMinutes(nextEndTime);

	if (
		!Number.isFinite(existingStartMinutes)
		|| !Number.isFinite(existingEndMinutes)
		|| !Number.isFinite(nextStartMinutes)
		|| !Number.isFinite(nextEndMinutes)
	) {
		return false;
	}

	return existingStartMinutes < nextEndMinutes && existingEndMinutes > nextStartMinutes;
};

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
	const keyValue = error?.keyValue || {};
	const duplicateKeys = new Set([
		...Object.keys(keyPattern),
		...Object.keys(keyValue)
	].map((key) => String(key || '').toLowerCase()));
	const message = String(error?.message || '').toLowerCase();
	const messageMentions = (keys = []) => keys.every((key) => message.includes(String(key || '').toLowerCase()));

	if (
		hasAllDuplicateKeys(duplicateKeys, ['teacherid', 'day', 'starttime']) ||
		(message.includes('teacherid_1') && message.includes('day_1') && message.includes('starttime_1')) ||
		messageMentions(['teacherid', 'day', 'starttime'])
	) {
		return createHttpError(409, ERROR_MESSAGES.teacherConflict);
	}

	if (
		hasAllDuplicateKeys(duplicateKeys, ['classid', 'section', 'day', 'periodnumber']) ||
		hasAllDuplicateKeys(duplicateKeys, ['classid', 'periodnumber']) ||
		(message.includes('classid_1') && message.includes('section_1') && message.includes('day_1') && message.includes('periodnumber_1')) ||
		messageMentions(['classid', 'periodnumber'])
	) {
		return createHttpError(409, ERROR_MESSAGES.classPeriodConflict);
	}

	return createHttpError(409, ERROR_MESSAGES.duplicateEntry);
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
			throw createHttpError(403, ERROR_MESSAGES.subjectNotAssignedToTeacher);
		}
		return;
	}

	const teacherProfile = await Teacher.findOne({ userId: teacherUserId }).select('subjects').lean();
	const assignedSubjectIds = new Set((teacherProfile?.subjects || []).map((item) => toIdString(item)).filter(Boolean));
	if (!assignedSubjectIds.has(normalizedSubjectId)) {
		throw createHttpError(403, ERROR_MESSAGES.subjectNotAssignedToTeacher);
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
		startTime,
		endTime
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
		throw createHttpError(400, 'Subject does not belong to selected class');
	}

	if (!teacherUser || teacherUser.role !== 'teacher') {
		throw createHttpError(400, 'Teacher not found');
	}

	await ensureTeacherAssignedToSubject({
		teacherUserId: teacherId,
		subject
	});

	const exclusionFilter = excludeId ? { _id: { $ne: excludeId } } : {};

	const [
		duplicateEntry,
		duplicateClassPeriod,
		subjectPeriodConflict,
		teacherStartTimeConflict,
		teacherTimeOverlapConflict
	] = await Promise.all([
		Timetable.findOne({
			classId,
			section,
			day,
			periodNumber,
			subjectId,
			teacherId,
			startTime,
			endTime,
			...exclusionFilter
		})
			.select('_id')
			.lean(),
		Timetable.findOne({
			classId,
			section,
			day,
			periodNumber,
			...exclusionFilter
		})
			.select('_id')
			.lean(),
		Timetable.findOne({
			subjectId,
			day,
			periodNumber,
			...exclusionFilter
		})
			.select('_id')
			.lean(),
		Timetable.findOne({
			teacherId,
			day,
			startTime,
			...exclusionFilter
		})
			.select('_id')
			.lean(),
		Timetable.findOne({
			teacherId,
			day,
			startTime: { $lt: endTime },
			endTime: { $gt: startTime },
			...exclusionFilter
		})
			.select('_id periodNumber startTime endTime')
			.lean()
	]);

	if (duplicateEntry) {
		throw createHttpError(409, ERROR_MESSAGES.duplicateEntry);
	}

	if (duplicateClassPeriod) {
		throw createHttpError(409, ERROR_MESSAGES.classPeriodConflict);
	}

	if (subjectPeriodConflict) {
		throw createHttpError(409, ERROR_MESSAGES.subjectPeriodConflict);
	}

	if (teacherStartTimeConflict) {
		throw createHttpError(409, ERROR_MESSAGES.teacherConflict);
	}

	if (
		teacherTimeOverlapConflict
		&& isTeacherTimeOverlap({
			existingStartTime: teacherTimeOverlapConflict.startTime,
			existingEndTime: teacherTimeOverlapConflict.endTime,
			nextStartTime: startTime,
			nextEndTime: endTime
		})
	) {
		throw createHttpError(409, ERROR_MESSAGES.teacherConflict);
	}
};

const getById = async (id) => Timetable.findById(id).populate(TIMETABLE_POPULATE).lean();

const createEntry = async ({ payload = {}, createdBy = null } = {}) => {
	await ensureTimetableIndexes();

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
	await ensureTimetableIndexes();

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