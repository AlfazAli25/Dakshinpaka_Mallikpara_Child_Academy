const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async.middleware');
const Marks = require('../models/Marks');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');
const Subject = require('../models/Subject');
const Exam = require('../models/Exam');
const { calculateGrade } = require('../utils/gradeCalculator');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 500;

const MARKS_POPULATE = [
  {
    path: 'studentId',
    select: 'admissionNo rollNo classId userId',
    populate: { path: 'userId', select: 'name email' }
  },
  { path: 'classId', select: 'name section' },
  { path: 'subjectId', select: 'name code classId teacherId' },
  { path: 'examId', select: 'examName examType academicYear startDate endDate examDate classId subjectId subjects date totalMarks description status' },
  { path: 'createdBy', select: 'name email role' }
];

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const toIdString = (value) => String(value?._id || value || '');

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

const isMongoDuplicateError = (error) => Number(error?.code || 0) === 11000;

const ensureOptionalObjectId = (value, label) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }

  if (!mongoose.Types.ObjectId.isValid(normalized)) {
    throw createHttpError(400, `Invalid ${label} selected`);
  }

  return normalized;
};

const normalizeTeacherScope = (teacher) => {
  const classIds = Array.isArray(teacher?.classIds)
    ? teacher.classIds.map((value) => String(value || '')).filter(Boolean)
    : [];
  const subjectIds = Array.isArray(teacher?.subjects)
    ? teacher.subjects.map((value) => String(value || '')).filter(Boolean)
    : [];

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
    throw createHttpError(403, 'Forbidden');
  }

  return normalizeTeacherScope(teacher);
};

const ensureTeacherCanManageClassSubject = async ({ userId, classId, subjectId }) => {
  const scope = await getTeacherScope(userId);

  if (!scope.classIdSet.has(String(classId || ''))) {
    throw createHttpError(403, 'You are not assigned to this class');
  }

  if (!scope.subjectIdSet.has(String(subjectId || ''))) {
    throw createHttpError(403, 'You are not assigned to this subject');
  }

  return scope;
};

const validateMarksInput = ({ marksObtained, maxMarks }) => {
  const obtained = Number(marksObtained);
  const total = Number(maxMarks);

  if (!Number.isFinite(obtained) || !Number.isFinite(total)) {
    throw createHttpError(400, 'Marks obtained and max marks must be numeric values');
  }

  if (obtained < 0) {
    throw createHttpError(400, 'marksObtained cannot be negative');
  }

  if (total <= 0) {
    throw createHttpError(400, 'maxMarks must be greater than zero');
  }

  if (obtained > total) {
    throw createHttpError(400, 'marksObtained cannot be greater than maxMarks');
  }

  const { percentage, grade } = calculateGrade(obtained, total);
  return {
    marksObtained: obtained,
    maxMarks: total,
    percentage,
    grade
  };
};

const ensureStudentBelongsToClass = async ({ studentId, classId }) => {
  const student = await Student.findById(studentId).select('_id classId userId').lean();
  if (!student) {
    throw createHttpError(400, 'Invalid student selected');
  }

  if (toIdString(student.classId) !== String(classId || '')) {
    throw createHttpError(400, 'Student is not enrolled in the selected class');
  }

  return student;
};

const ensureSubjectClassTeacherConsistency = async ({ subjectId, classId, teacherUserId }) => {
  const subject = await Subject.findById(subjectId).select('_id classId teacherId').lean();
  if (!subject) {
    throw createHttpError(400, 'Invalid subject selected');
  }

  if (toIdString(subject.classId) !== String(classId || '')) {
    throw createHttpError(400, 'Selected subject does not belong to the selected class');
  }

  if (subject.teacherId && toIdString(subject.teacherId) !== String(teacherUserId || '')) {
    throw createHttpError(403, 'You are not assigned to this subject');
  }

  return subject;
};

const resolveExamWindowForSubject = ({ exam, classId, subjectId }) => {
  const normalizedClassId = String(classId || '').trim();
  const normalizedSubjectId = String(subjectId || '').trim();

  const scheduleRows = Array.isArray(exam?.schedule) ? exam.schedule : [];
  const scheduleSlot = scheduleRows.find((row) => {
    const rowSubjectId = toIdString(row?.subjectId);
    if (rowSubjectId !== normalizedSubjectId) {
      return false;
    }

    const rowClassId = toIdString(row?.classId);
    return !rowClassId || !normalizedClassId || rowClassId === normalizedClassId;
  });

  const fallbackStartDate = exam?.startDate || exam?.examDate || exam?.date;
  const fallbackEndDate = exam?.endDate || fallbackStartDate;

  const startDate = scheduleSlot?.startDate || fallbackStartDate;
  const endDate = scheduleSlot?.endDate || fallbackEndDate;

  const normalizedStartDate = startDate ? new Date(startDate) : null;
  const normalizedEndDate = endDate ? new Date(endDate) : null;

  return {
    startDate: normalizedStartDate,
    endDate: normalizedEndDate
  };
};

const ensureExamConductedForSubject = ({ exam, classId, subjectId }) => {
  const { startDate, endDate } = resolveExamWindowForSubject({ exam, classId, subjectId });

  if (!endDate || Number.isNaN(endDate.getTime())) {
    throw createHttpError(400, 'Selected exam schedule is invalid');
  }

  if (startDate && !Number.isNaN(startDate.getTime()) && endDate.getTime() < startDate.getTime()) {
    throw createHttpError(400, 'Selected exam schedule is invalid');
  }

  if (endDate.getTime() > Date.now()) {
    throw createHttpError(400, 'Marks can be entered only after the exam is conducted');
  }
};

const ensureExamConsistency = async ({ examId, classId, subjectId }) => {
  const exam = await Exam.findById(examId)
    .select('_id classId subjectId subjects schedule startDate endDate examDate date status')
    .lean();
  if (!exam) {
    throw createHttpError(400, 'Invalid exam selected');
  }

  if (toIdString(exam.classId) !== String(classId || '')) {
    throw createHttpError(400, 'Selected exam does not belong to the selected class');
  }

  const normalizedExamSubjectIds = Array.isArray(exam.subjects)
    ? exam.subjects.map((value) => String(value || '')).filter(Boolean)
    : [];

  if (normalizedExamSubjectIds.length > 0 && !normalizedExamSubjectIds.includes(String(subjectId || ''))) {
    throw createHttpError(400, 'Selected exam does not include the selected subject');
  }

  if (normalizedExamSubjectIds.length === 0 && exam.subjectId && toIdString(exam.subjectId) !== String(subjectId || '')) {
    throw createHttpError(400, 'Selected exam does not belong to the selected subject');
  }

  ensureExamConductedForSubject({ exam, classId, subjectId });

  const overallExamEndDate = exam?.endDate ? new Date(exam.endDate) : null;
  const overallExamEnded = Boolean(overallExamEndDate && !Number.isNaN(overallExamEndDate.getTime()) && overallExamEndDate.getTime() <= Date.now());

  if (overallExamEnded && String(exam.status || '').trim() !== 'Completed') {
    await Exam.updateOne({ _id: exam._id }, { $set: { status: 'Completed' } });
  }

  return exam;
};

const buildPaginatedResponse = async ({ filter, page, limit }) => {
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    Marks.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(MARKS_POPULATE)
      .lean(),
    Marks.countDocuments(filter)
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages
    }
  };
};

const createMarks = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'teacher') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  const studentId = String(req.body.studentId || '').trim();
  const classId = String(req.body.classId || '').trim();
  const subjectId = String(req.body.subjectId || '').trim();
  const examId = String(req.body.examId || '').trim();
  const remarks = String(req.body.remarks || '').trim();

  const marksValues = validateMarksInput({
    marksObtained: req.body.marksObtained,
    maxMarks: req.body.maxMarks
  });

  await ensureTeacherCanManageClassSubject({ userId: req.user._id, classId, subjectId });

  await Promise.all([
    ensureStudentBelongsToClass({ studentId, classId }),
    ensureSubjectClassTeacherConsistency({ subjectId, classId, teacherUserId: req.user._id }),
    ensureExamConsistency({ examId, classId, subjectId })
  ]);

  const duplicate = await Marks.findOne({ studentId, subjectId, examId }).select('_id').lean();
  if (duplicate) {
    return res.status(409).json({ success: false, message: 'Marks already entered for this student, subject, and exam' });
  }

  try {
    const created = await Marks.create({
      studentId,
      classId,
      subjectId,
      examId,
      marksObtained: marksValues.marksObtained,
      maxMarks: marksValues.maxMarks,
      percentage: marksValues.percentage,
      grade: marksValues.grade,
      remarks,
      createdBy: req.user._id
    });

    const data = await Marks.findById(created._id).populate(MARKS_POPULATE).lean();
    return res.status(201).json({ success: true, data });
  } catch (error) {
    if (isMongoDuplicateError(error)) {
      return res.status(409).json({ success: false, message: 'Marks already entered for this student, subject, and exam' });
    }
    throw error;
  }
});

const updateMarks = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'teacher') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  const existing = await Marks.findById(req.params.id).lean();
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Marks not found' });
  }

  const nextStudentId = req.body.studentId !== undefined ? String(req.body.studentId || '').trim() : toIdString(existing.studentId);
  const nextClassId = req.body.classId !== undefined ? String(req.body.classId || '').trim() : toIdString(existing.classId);
  const nextSubjectId = req.body.subjectId !== undefined ? String(req.body.subjectId || '').trim() : toIdString(existing.subjectId);
  const nextExamId = req.body.examId !== undefined ? String(req.body.examId || '').trim() : toIdString(existing.examId);
  const nextRemarks = req.body.remarks !== undefined ? String(req.body.remarks || '').trim() : String(existing.remarks || '');

  const marksValues = validateMarksInput({
    marksObtained: req.body.marksObtained !== undefined ? req.body.marksObtained : existing.marksObtained,
    maxMarks: req.body.maxMarks !== undefined ? req.body.maxMarks : existing.maxMarks
  });

  await ensureTeacherCanManageClassSubject({
    userId: req.user._id,
    classId: nextClassId,
    subjectId: nextSubjectId
  });

  await Promise.all([
    ensureStudentBelongsToClass({ studentId: nextStudentId, classId: nextClassId }),
    ensureSubjectClassTeacherConsistency({
      subjectId: nextSubjectId,
      classId: nextClassId,
      teacherUserId: req.user._id
    }),
    ensureExamConsistency({ examId: nextExamId, classId: nextClassId, subjectId: nextSubjectId })
  ]);

  const duplicate = await Marks.findOne({
    _id: { $ne: existing._id },
    studentId: nextStudentId,
    subjectId: nextSubjectId,
    examId: nextExamId
  })
    .select('_id')
    .lean();

  if (duplicate) {
    return res.status(409).json({ success: false, message: 'Marks already entered for this student, subject, and exam' });
  }

  try {
    const updated = await Marks.findByIdAndUpdate(
      existing._id,
      {
        studentId: nextStudentId,
        classId: nextClassId,
        subjectId: nextSubjectId,
        examId: nextExamId,
        marksObtained: marksValues.marksObtained,
        maxMarks: marksValues.maxMarks,
        percentage: marksValues.percentage,
        grade: marksValues.grade,
        remarks: nextRemarks
      },
      { new: true, runValidators: true }
    )
      .populate(MARKS_POPULATE)
      .lean();

    return res.json({ success: true, data: updated });
  } catch (error) {
    if (isMongoDuplicateError(error)) {
      return res.status(409).json({ success: false, message: 'Marks already entered for this student, subject, and exam' });
    }
    throw error;
  }
});

const getMarksByStudent = asyncHandler(async (req, res) => {
  const studentId = String(req.params.studentId || '').trim();
  const student = await Student.findById(studentId).select('_id classId userId').lean();
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }

  const { page, limit } = parsePagination(req.query || {});
  const filter = { studentId };

  const queryClassId = ensureOptionalObjectId(req.query.classId, 'class');
  const querySubjectId = ensureOptionalObjectId(req.query.subjectId, 'subject');
  const queryExamId = ensureOptionalObjectId(req.query.examId, 'exam');

  if (req.user?.role === 'student') {
    if (toIdString(student.userId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
  } else if (req.user?.role === 'teacher') {
    const scope = await getTeacherScope(req.user._id);
    const studentClassId = toIdString(student.classId);

    if (!scope.classIdSet.has(studentClassId)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    filter.classId = studentClassId;

    if (scope.subjectIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 }
      });
    }

    if (querySubjectId && !scope.subjectIdSet.has(querySubjectId)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    filter.subjectId = querySubjectId || { $in: scope.subjectIds };
  } else if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  if (queryClassId) {
    filter.classId = queryClassId;
  }

  if (querySubjectId && !(req.user?.role === 'teacher' && typeof filter.subjectId === 'object')) {
    filter.subjectId = querySubjectId;
  }

  if (queryExamId) {
    filter.examId = queryExamId;
  }

  const result = await buildPaginatedResponse({ filter, page, limit });
  return res.json({ success: true, ...result });
});

const getMarksByClass = asyncHandler(async (req, res) => {
  const classId = String(req.params.classId || '').trim();
  const { page, limit } = parsePagination(req.query || {});

  const querySubjectId = ensureOptionalObjectId(req.query.subjectId, 'subject');
  const queryExamId = ensureOptionalObjectId(req.query.examId, 'exam');

  const filter = { classId };

  if (req.user?.role === 'teacher') {
    const scope = await getTeacherScope(req.user._id);
    if (!scope.classIdSet.has(classId)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (scope.subjectIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 }
      });
    }

    if (querySubjectId && !scope.subjectIdSet.has(querySubjectId)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    filter.subjectId = querySubjectId || { $in: scope.subjectIds };
  } else if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  if (querySubjectId && !(req.user?.role === 'teacher' && typeof filter.subjectId === 'object')) {
    filter.subjectId = querySubjectId;
  }

  if (queryExamId) {
    filter.examId = queryExamId;
  }

  const result = await buildPaginatedResponse({ filter, page, limit });
  return res.json({ success: true, ...result });
});

const listMarks = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const { page, limit } = parsePagination(req.query || {});

  const filter = {};
  const classId = ensureOptionalObjectId(req.query.classId, 'class');
  const studentId = ensureOptionalObjectId(req.query.studentId, 'student');
  const subjectId = ensureOptionalObjectId(req.query.subjectId, 'subject');
  const examId = ensureOptionalObjectId(req.query.examId, 'exam');

  if (classId) {
    filter.classId = classId;
  }
  if (studentId) {
    filter.studentId = studentId;
  }
  if (subjectId) {
    filter.subjectId = subjectId;
  }
  if (examId) {
    filter.examId = examId;
  }

  const result = await buildPaginatedResponse({ filter, page, limit });
  return res.json({ success: true, ...result });
});

const deleteMarks = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const deleted = await Marks.findByIdAndDelete(req.params.id).lean();
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Marks not found' });
  }

  return res.json({ success: true, message: 'Marks deleted successfully' });
});

module.exports = {
  createMarks,
  updateMarks,
  getMarksByStudent,
  getMarksByClass,
  listMarks,
  deleteMarks
};
