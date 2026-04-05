const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async.middleware');
const Exam = require('../models/Exam');
const ClassModel = require('../models/class.model');
const Subject = require('../models/Subject');
const Teacher = require('../models/teacher.model');
const Student = require('../models/student.model');
const Grade = require('../models/grade.model');
const Marks = require('../models/marks.model');

const EXAM_TYPES = ['Unit Test', 'Mid Term', 'Final', 'Practical', 'Assignment'];
const EXAM_STATUS = ['Scheduled', 'Ongoing', 'Completed'];
const ACADEMIC_YEAR_REGEX = /^\d{4}-\d{4}$/;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const EXAM_POPULATE = [
  { path: 'classId', select: 'name section' },
  { path: 'subjects', select: 'name code classId teacherId' },
  { path: 'schedule.classId', select: 'name section' },
  { path: 'schedule.subjectId', select: 'name code classId teacherId' },
  { path: 'createdBy', select: 'name email role' }
];

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const toIdString = (value) => String(value?._id || value || '');

const normalizeObjectIdArray = (items = []) => {
  if (!Array.isArray(items)) {
    return [];
  }

  return Array.from(
    new Set(
      items
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
};

const isDuplicateError = (error) => Number(error?.code || 0) === 11000;

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

const parsePagination = (query = {}) => {
  const page = toPositiveInt(query.page ?? query._page, DEFAULT_PAGE);
  const limit = Math.min(toPositiveInt(query.limit ?? query._limit, DEFAULT_LIMIT), MAX_LIMIT);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const normalizeDateValue = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const hasTimeOverlap = (firstStartMs, firstEndMs, secondStartMs, secondEndMs) =>
  firstStartMs < secondEndMs && secondStartMs < firstEndMs;

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeTeacherScope = (teacher) => {
  const classIds = normalizeObjectIdArray(teacher?.classIds || []);
  const subjectIds = normalizeObjectIdArray(teacher?.subjects || []);

  return {
    classIds,
    subjectIds,
    classIdSet: new Set(classIds),
    subjectIdSet: new Set(subjectIds)
  };
};

const getTeacherScope = async (userId) => {
  const teacher = await Teacher.findOne({ userId }).select('classIds subjects').lean();
  if (!teacher) {
    return normalizeTeacherScope({ classIds: [], subjects: [] });
  }

  return normalizeTeacherScope(teacher);
};

const getStudentClassId = async (userId) => {
  const student = await Student.findOne({ userId }).select('classId').lean();
  return toIdString(student?.classId);
};

const extractExamSubjectIds = (exam) => {
  const subjects = normalizeObjectIdArray(exam?.subjects || []);
  if (subjects.length > 0) {
    return subjects;
  }

  const legacySubjectId = toIdString(exam?.subjectId);
  return legacySubjectId ? [legacySubjectId] : [];
};

const hasTeacherExamAccess = (exam, teacherScope) => {
  const examClassId = toIdString(exam?.classId);
  if (!teacherScope.classIdSet.has(examClassId)) {
    return false;
  }

  const examSubjectIds = extractExamSubjectIds(exam);
  if (examSubjectIds.length === 0) {
    return true;
  }

  if (teacherScope.subjectIds.length === 0) {
    return false;
  }

  return examSubjectIds.some((subjectId) => teacherScope.subjectIdSet.has(subjectId));
};

const buildFilterFromQuery = (query = {}) => {
  const filter = {};

  if (query.classId) {
    const classId = String(query.classId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(classId)) {
      throw createHttpError(400, 'Invalid class selected');
    }
    filter.classId = classId;
  }

  if (query.academicYear !== undefined) {
    const academicYear = String(query.academicYear || '').trim();
    if (academicYear) {
      if (!ACADEMIC_YEAR_REGEX.test(academicYear)) {
        throw createHttpError(400, 'Academic year must be in YYYY-YYYY format');
      }
      filter.academicYear = academicYear;
    }
  }

  if (query.status !== undefined) {
    const status = String(query.status || '').trim();
    if (status) {
      if (!EXAM_STATUS.includes(status)) {
        throw createHttpError(400, 'Invalid exam status selected');
      }
      filter.status = status;
    }
  }

  if (query.examType !== undefined) {
    const examType = String(query.examType || '').trim();
    if (examType) {
      if (!EXAM_TYPES.includes(examType)) {
        throw createHttpError(400, 'Invalid exam type selected');
      }
      filter.examType = examType;
    }
  }

  if (query.search !== undefined) {
    const search = String(query.search || '').trim();
    if (search) {
      filter.examName = { $regex: escapeRegex(search), $options: 'i' };
    }
  }

  return filter;
};

const fetchExams = async ({ filter, page, limit }) => {
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Exam.find(filter)
      .sort({ startDate: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(EXAM_POPULATE)
      .lean(),
    Exam.countDocuments(filter)
  ]);

  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages
    }
  };
};

const resolveExamPayload = async (payload = {}, { existingExam = null, createdBy = null } = {}) => {
  const examName =
    payload.examName !== undefined
      ? String(payload.examName || '').trim()
      : String(existingExam?.examName || '').trim();

  if (!examName) {
    throw createHttpError(400, 'Exam name is required');
  }

  const examType =
    payload.examType !== undefined
      ? String(payload.examType || '').trim()
      : String(existingExam?.examType || 'Unit Test').trim();

  if (!EXAM_TYPES.includes(examType)) {
    throw createHttpError(400, 'Invalid exam type selected');
  }

  const classId =
    payload.classId !== undefined
      ? String(payload.classId || '').trim()
      : toIdString(existingExam?.classId);

  if (!mongoose.Types.ObjectId.isValid(classId)) {
    throw createHttpError(400, 'Valid class is required');
  }

  const academicYear =
    payload.academicYear !== undefined
      ? String(payload.academicYear || '').trim()
      : String(existingExam?.academicYear || '').trim();

  if (!academicYear) {
    throw createHttpError(400, 'Academic year is required');
  }

  if (!ACADEMIC_YEAR_REGEX.test(academicYear)) {
    throw createHttpError(400, 'Academic year must be in YYYY-YYYY format');
  }

  const incomingScheduleValues =
    payload.schedule !== undefined
      ? payload.schedule
      : Array.isArray(existingExam?.schedule)
        ? existingExam.schedule
        : [];

  if (incomingScheduleValues !== undefined && incomingScheduleValues !== null && !Array.isArray(incomingScheduleValues)) {
    throw createHttpError(400, 'Schedule must be an array');
  }

  const schedule = [];
  const scheduleKeySet = new Set();
  const scheduleWindowsByClass = new Map();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  (Array.isArray(incomingScheduleValues) ? incomingScheduleValues : []).forEach((item, index) => {
    const scheduleClassId = String(item?.classId || classId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(scheduleClassId)) {
      throw createHttpError(400, `Invalid class in schedule row ${index + 1}`);
    }

    if (scheduleClassId !== classId) {
      throw createHttpError(400, 'Schedule entries must belong to the selected class');
    }

    const scheduleSubjectId = String(item?.subjectId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(scheduleSubjectId)) {
      throw createHttpError(400, `Invalid subject in schedule row ${index + 1}`);
    }

    const scheduleStartDate = normalizeDateValue(item?.startDate);
    if (!scheduleStartDate) {
      throw createHttpError(400, `Valid start date is required in schedule row ${index + 1}`);
    }

    const scheduleEndDate = normalizeDateValue(item?.endDate);
    if (!scheduleEndDate) {
      throw createHttpError(400, `Valid end date is required in schedule row ${index + 1}`);
    }

    const scheduleStartDay = new Date(scheduleStartDate);
    scheduleStartDay.setHours(0, 0, 0, 0);

    if (scheduleStartDay.getTime() < todayStart.getTime()) {
      throw createHttpError(400, `Exam date cannot be in the past in schedule row ${index + 1}`);
    }

    const scheduleEndDay = new Date(scheduleEndDate);
    scheduleEndDay.setHours(0, 0, 0, 0);

    if (scheduleStartDay.getTime() !== scheduleEndDay.getTime()) {
      throw createHttpError(400, `Start and end time must be on the same exam date in schedule row ${index + 1}`);
    }

    if (scheduleEndDate.getTime() <= scheduleStartDate.getTime()) {
      throw createHttpError(400, `End time must be after start time in schedule row ${index + 1}`);
    }

    const scheduleStartMs = scheduleStartDate.getTime();
    const scheduleEndMs = scheduleEndDate.getTime();
    const existingClassWindows = scheduleWindowsByClass.get(scheduleClassId) || [];
    const overlapWindow = existingClassWindows.find((window) =>
      hasTimeOverlap(scheduleStartMs, scheduleEndMs, window.startMs, window.endMs)
    );

    if (overlapWindow) {
      throw createHttpError(
        400,
        `Two subjects of the same class cannot be scheduled simultaneously (schedule rows ${overlapWindow.rowIndex + 1} and ${index + 1})`
      );
    }

    existingClassWindows.push({
      startMs: scheduleStartMs,
      endMs: scheduleEndMs,
      rowIndex: index
    });
    scheduleWindowsByClass.set(scheduleClassId, existingClassWindows);

    const scheduleKey = `${scheduleClassId}:${scheduleSubjectId}`;
    if (scheduleKeySet.has(scheduleKey)) {
      throw createHttpError(400, 'Duplicate schedule entry for selected subject');
    }

    scheduleKeySet.add(scheduleKey);
    schedule.push({
      classId: scheduleClassId,
      subjectId: scheduleSubjectId,
      startDate: scheduleStartDate,
      endDate: scheduleEndDate
    });
  });

  const scheduleStartMs = schedule.length > 0 ? Math.min(...schedule.map((item) => item.startDate.getTime())) : 0;
  const scheduleEndMs = schedule.length > 0 ? Math.max(...schedule.map((item) => item.endDate.getTime())) : 0;

  const startDateRaw =
    payload.startDate !== undefined
      ? payload.startDate
      : payload.date !== undefined
        ? payload.date
        : existingExam?.startDate || existingExam?.date;

  let startDate = normalizeDateValue(startDateRaw);
  if (!startDate && schedule.length > 0) {
    startDate = new Date(scheduleStartMs);
  }

  if (!startDate) {
    throw createHttpError(400, 'Valid start date is required');
  }

  let endDateValue;
  if (payload.endDate !== undefined) {
    endDateValue = payload.endDate;
  } else {
    endDateValue = existingExam?.endDate;
  }

  let endDate = normalizeDateValue(endDateValue);
  if (endDateValue !== undefined && endDateValue !== null && String(endDateValue).trim() !== '' && !endDate) {
    throw createHttpError(400, 'Invalid end date selected');
  }

  if (!endDate && schedule.length > 0) {
    endDate = new Date(scheduleEndMs);
  }

  if (schedule.length > 0 && startDate.getTime() > scheduleStartMs) {
    startDate = new Date(scheduleStartMs);
  }

  if (schedule.length > 0 && (!endDate || endDate.getTime() < scheduleEndMs)) {
    endDate = new Date(scheduleEndMs);
  }

  if (endDate && endDate.getTime() < startDate.getTime()) {
    throw createHttpError(400, 'End date must be greater than or equal to start date');
  }

  const incomingSubjectValues =
    payload.subjects !== undefined
      ? payload.subjects
      : existingExam?.subjects?.length
        ? existingExam.subjects
        : existingExam?.subjectId
          ? [existingExam.subjectId]
          : [];

  const subjectIds = normalizeObjectIdArray([...incomingSubjectValues, ...schedule.map((item) => item.subjectId)]);

  if (subjectIds.length === 0) {
    throw createHttpError(400, 'Select at least one subject');
  }

  if (subjectIds.some((subjectId) => !mongoose.Types.ObjectId.isValid(subjectId))) {
    throw createHttpError(400, 'Invalid subject selected');
  }

  const status =
    payload.status !== undefined
      ? String(payload.status || '').trim()
      : String(existingExam?.status || 'Scheduled').trim();

  if (!EXAM_STATUS.includes(status)) {
    throw createHttpError(400, 'Invalid exam status selected');
  }

  const description =
    payload.description !== undefined
      ? String(payload.description || '').trim()
      : String(existingExam?.description || '').trim();

  const classRecord = await ClassModel.findById(classId).select('_id').lean();
  if (!classRecord) {
    throw createHttpError(400, 'Selected class does not exist');
  }

  const subjectRows = await Subject.find({ _id: { $in: subjectIds } }).select('_id classId').lean();
  if (subjectRows.length !== subjectIds.length) {
    throw createHttpError(400, 'One or more selected subjects are invalid');
  }

  const subjectOutsideClass = subjectRows.find((item) => toIdString(item.classId) !== classId);
  if (subjectOutsideClass) {
    throw createHttpError(400, 'Selected subjects must belong to the selected class');
  }

  if (schedule.length > 0) {
    const scheduleSubjectIdSet = new Set(schedule.map((item) => item.subjectId));
    const subjectWithoutSchedule = subjectIds.find((subjectId) => !scheduleSubjectIdSet.has(subjectId));

    if (subjectWithoutSchedule) {
      throw createHttpError(400, 'Every selected subject must have a schedule row');
    }
  }

  return {
    examName,
    examType,
    classId,
    subjects: subjectIds,
    schedule,
    academicYear,
    startDate,
    endDate: endDate || undefined,
    description,
    status,
    createdBy: createdBy || existingExam?.createdBy || undefined,

    // Legacy compatibility projection.
    subjectId: subjectIds[0],
    date: startDate,
    examDate: startDate
  };
};

const createExam = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const payload = await resolveExamPayload(req.body, { createdBy: req.user._id });
    const createdExam = await Exam.create(payload);
    const data = await Exam.findById(createdExam._id).populate(EXAM_POPULATE).lean();

    return res.status(201).json({ success: true, data });
  } catch (error) {
    if (isDuplicateError(error)) {
      return res.status(409).json({ success: false, message: 'Exam already exists' });
    }

    throw error;
  }
});

const getAllExams = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query || {});
  const baseFilter = buildFilterFromQuery(req.query || {});

  if (req.user?.role === 'admin') {
    const result = await fetchExams({ filter: baseFilter, page, limit });
    return res.json({ success: true, ...result });
  }

  if (req.user?.role === 'teacher') {
    const teacherScope = await getTeacherScope(req.user._id);
    if (teacherScope.classIds.length === 0 || teacherScope.subjectIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 }
      });
    }

    const requestedClassId = toIdString(baseFilter.classId);
    if (requestedClassId && !teacherScope.classIdSet.has(requestedClassId)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const teacherFilter = { ...baseFilter };
    delete teacherFilter.classId;

    teacherFilter.classId = requestedClassId || { $in: teacherScope.classIds };
    teacherFilter.subjects = { $in: teacherScope.subjectIds };

    const result = await fetchExams({ filter: teacherFilter, page, limit });
    return res.json({ success: true, ...result });
  }

  if (req.user?.role === 'student') {
    const studentClassId = await getStudentClassId(req.user._id);
    if (!studentClassId) {
      return res.json({
        success: true,
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 }
      });
    }

    const requestedClassId = toIdString(baseFilter.classId);
    if (requestedClassId && requestedClassId !== studentClassId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const studentFilter = { ...baseFilter, classId: studentClassId };
    const result = await fetchExams({ filter: studentFilter, page, limit });
    return res.json({ success: true, ...result });
  }

  return res.status(403).json({ success: false, message: 'Forbidden' });
});

const getExamsByClass = asyncHandler(async (req, res) => {
  const classId = String(req.params.classId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(classId)) {
    return res.status(400).json({ success: false, message: 'Invalid class selected' });
  }

  const { page, limit } = parsePagination(req.query || {});
  const baseFilter = buildFilterFromQuery({ ...req.query, classId });

  if (req.user?.role === 'admin') {
    const result = await fetchExams({ filter: baseFilter, page, limit });
    return res.json({ success: true, ...result });
  }

  if (req.user?.role === 'teacher') {
    const teacherScope = await getTeacherScope(req.user._id);
    if (!teacherScope.classIdSet.has(classId)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (teacherScope.subjectIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 }
      });
    }

    const teacherFilter = {
      ...baseFilter,
      classId,
      subjects: { $in: teacherScope.subjectIds }
    };

    const result = await fetchExams({ filter: teacherFilter, page, limit });
    return res.json({ success: true, ...result });
  }

  if (req.user?.role === 'student') {
    const studentClassId = await getStudentClassId(req.user._id);
    if (!studentClassId || studentClassId !== classId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const result = await fetchExams({ filter: { ...baseFilter, classId }, page, limit });
    return res.json({ success: true, ...result });
  }

  return res.status(403).json({ success: false, message: 'Forbidden' });
});

const getExamById = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid exam selected' });
  }

  const exam = await Exam.findById(req.params.id).populate(EXAM_POPULATE).lean();
  if (!exam) {
    return res.status(404).json({ success: false, message: 'Exam not found' });
  }

  if (req.user?.role === 'admin') {
    return res.json({ success: true, data: exam });
  }

  if (req.user?.role === 'teacher') {
    const teacherScope = await getTeacherScope(req.user._id);
    if (!hasTeacherExamAccess(exam, teacherScope)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    return res.json({ success: true, data: exam });
  }

  if (req.user?.role === 'student') {
    const studentClassId = await getStudentClassId(req.user._id);
    if (!studentClassId || studentClassId !== toIdString(exam.classId)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    return res.json({ success: true, data: exam });
  }

  return res.status(403).json({ success: false, message: 'Forbidden' });
});

const updateExam = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid exam selected' });
  }

  const existingExam = await Exam.findById(req.params.id).lean();
  if (!existingExam) {
    return res.status(404).json({ success: false, message: 'Exam not found' });
  }

  try {
    const payload = await resolveExamPayload(req.body, { existingExam });
    const updatedExam = await Exam.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true
    })
      .populate(EXAM_POPULATE)
      .lean();

    return res.json({ success: true, data: updatedExam });
  } catch (error) {
    if (isDuplicateError(error)) {
      return res.status(409).json({ success: false, message: 'Exam already exists' });
    }

    throw error;
  }
});

const deleteExam = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid exam selected' });
  }

  const existingExam = await Exam.findById(req.params.id).select('_id').lean();
  if (!existingExam) {
    return res.status(404).json({ success: false, message: 'Exam not found' });
  }

  const [linkedGrade, linkedMarks] = await Promise.all([
    Grade.findOne({ examId: req.params.id }).select('_id').lean(),
    Marks.findOne({ examId: req.params.id }).select('_id').lean()
  ]);

  if (linkedGrade || linkedMarks) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete exam linked to grade or marks records'
    });
  }

  await Exam.findByIdAndDelete(req.params.id);
  return res.json({ success: true, message: 'Exam deleted successfully' });
});

module.exports = {
  createExam,
  getAllExams,
  getExamsByClass,
  getExamById,
  updateExam,
  deleteExam
};
