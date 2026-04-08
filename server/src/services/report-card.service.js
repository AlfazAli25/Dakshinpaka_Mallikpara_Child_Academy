const mongoose = require('mongoose');
const Exam = require('../models/exam.model');
const ClassModel = require('../models/class.model');
const Student = require('../models/student.model');
const Subject = require('../models/subject.model');
const Marks = require('../models/marks.model');

const ACADEMIC_YEAR_REGEX = /^\d{4}(?:-\d{4})?$/;

const REPORT_CARD_SLOTS = [
  {
    key: 'unitTest1',
    label: 'Unit Test 1',
    maxMarks: 40
  },
  {
    key: 'unitTest2',
    label: 'Unit Test 2',
    maxMarks: 40
  },
  {
    key: 'finalExam',
    label: 'Final Exam',
    maxMarks: 100
  }
];

const TOTAL_MAX_PER_SUBJECT = REPORT_CARD_SLOTS.reduce((sum, item) => sum + item.maxMarks, 0);

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const toId = (value) => String(value?._id || value || '').trim();

const toText = (value, fallback = '') => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

const toValidDate = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const toNumberOrNull = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return numeric;
};

const toSafeFileToken = (value, fallback = 'Value') => {
  const normalized = toText(value).replace(/[^A-Za-z0-9_-]/g, '_');
  return normalized || fallback;
};

const toExamTimestamp = (exam) => {
  const dateValue = exam?.endDate || exam?.startDate || exam?.examDate || exam?.date || exam?.createdAt;
  const parsed = toValidDate(dateValue);
  return parsed ? parsed.getTime() : 0;
};

const getExamSearchText = (exam) =>
  `${toText(exam?.examName)} ${toText(exam?.description)} ${toText(exam?.examType)}`.toLowerCase();

const isExamCompleted = (exam) => {
  const status = toText(exam?.status).toLowerCase();
  if (status === 'completed') {
    return true;
  }

  const endDate = toValidDate(exam?.endDate || exam?.startDate || exam?.examDate || exam?.date);
  if (!endDate) {
    return false;
  }

  return endDate.getTime() <= Date.now();
};

const isFinalExam = (exam) => {
  const examType = toText(exam?.examType).toLowerCase();
  if (examType === 'final') {
    return true;
  }

  return /\bfinal\b/.test(getExamSearchText(exam));
};

const isUnitTestExam = (exam) => {
  const examType = toText(exam?.examType).toLowerCase();
  if (examType === 'unit test') {
    return true;
  }

  return /unit\s*test|\but\b/.test(getExamSearchText(exam));
};

const looksLikeUnitTestOne = (exam) => /unit\s*test\s*1|test\s*1|\but\s*1\b|\b1st\b|\bfirst\b/.test(getExamSearchText(exam));
const looksLikeUnitTestTwo = (exam) => /unit\s*test\s*2|test\s*2|\but\s*2\b|\b2nd\b|\bsecond\b/.test(getExamSearchText(exam));

const sortByDateAsc = (items = []) =>
  [...items].sort((left, right) => toExamTimestamp(left) - toExamTimestamp(right));

const sortByDateDesc = (items = []) =>
  [...items].sort((left, right) => toExamTimestamp(right) - toExamTimestamp(left));

const pickSlotExams = (examRows = []) => {
  const completedExams = (Array.isArray(examRows) ? examRows : []).filter((item) => isExamCompleted(item));

  const unitTestCandidates = sortByDateAsc(completedExams.filter((item) => isUnitTestExam(item)));
  const finalCandidates = sortByDateDesc(completedExams.filter((item) => isFinalExam(item)));

  let unitTest1Exam = unitTestCandidates.find((item) => looksLikeUnitTestOne(item)) || null;
  let unitTest2Exam = unitTestCandidates.find((item) => looksLikeUnitTestTwo(item)) || null;

  if (!unitTest1Exam && unitTestCandidates.length > 0) {
    unitTest1Exam = unitTestCandidates[0];
  }

  if (!unitTest2Exam) {
    unitTest2Exam = unitTestCandidates.find((item) => toId(item) !== toId(unitTest1Exam)) || null;
  }

  if (unitTest1Exam && unitTest2Exam && toId(unitTest1Exam) === toId(unitTest2Exam)) {
    unitTest2Exam = null;
  }

  const finalExam = finalCandidates[0] || null;

  const slotExams = {
    unitTest1: unitTest1Exam,
    unitTest2: unitTest2Exam,
    finalExam
  };

  const missingSlotLabels = REPORT_CARD_SLOTS
    .filter((slot) => !slotExams[slot.key])
    .map((slot) => slot.label);

  return {
    slotExams,
    missingSlotLabels
  };
};

const collectSubjectIds = ({ classRecord = {}, marksRows = [], slotExams = {} }) => {
  const subjectIdSet = new Set(
    Array.isArray(classRecord?.subjectIds)
      ? classRecord.subjectIds.map((item) => toId(item)).filter(Boolean)
      : []
  );

  Object.values(slotExams).forEach((exam) => {
    if (!exam) {
      return;
    }

    const examSubjectIds = Array.isArray(exam?.subjects)
      ? exam.subjects.map((item) => toId(item)).filter(Boolean)
      : [];

    const scheduleSubjectIds = Array.isArray(exam?.schedule)
      ? exam.schedule.map((item) => toId(item?.subjectId)).filter(Boolean)
      : [];

    [...examSubjectIds, ...scheduleSubjectIds, toId(exam?.subjectId)]
      .filter(Boolean)
      .forEach((subjectId) => subjectIdSet.add(subjectId));
  });

  (Array.isArray(marksRows) ? marksRows : [])
    .map((item) => toId(item?.subjectId))
    .filter(Boolean)
    .forEach((subjectId) => subjectIdSet.add(subjectId));

  return Array.from(subjectIdSet);
};

const buildSubjectOrdering = ({ classRecord = {}, subjectRows = [], marksRows = [], slotExams = {} }) => {
  const subjectIdsFromClass = Array.isArray(classRecord?.subjectIds)
    ? classRecord.subjectIds.map((item) => toId(item)).filter(Boolean)
    : [];

  const subjectIdSet = new Set(subjectIdsFromClass);

  Object.values(slotExams).forEach((exam) => {
    if (!exam) {
      return;
    }

    const examSubjectIds = Array.isArray(exam?.subjects)
      ? exam.subjects.map((item) => toId(item)).filter(Boolean)
      : [];

    const scheduleSubjectIds = Array.isArray(exam?.schedule)
      ? exam.schedule.map((item) => toId(item?.subjectId)).filter(Boolean)
      : [];

    [...examSubjectIds, ...scheduleSubjectIds, toId(exam?.subjectId)]
      .filter(Boolean)
      .forEach((subjectId) => subjectIdSet.add(subjectId));
  });

  (Array.isArray(marksRows) ? marksRows : [])
    .map((item) => toId(item?.subjectId))
    .filter(Boolean)
    .forEach((subjectId) => subjectIdSet.add(subjectId));

  const subjectMap = new Map(
    (Array.isArray(subjectRows) ? subjectRows : []).map((item) => [toId(item), item])
  );

  const orderedFromClass = subjectIdsFromClass.filter((subjectId) => subjectMap.has(subjectId));
  const remainingSubjectIds = Array.from(subjectIdSet)
    .filter((subjectId) => !orderedFromClass.includes(subjectId))
    .filter((subjectId) => subjectMap.has(subjectId))
    .sort((left, right) => {
      const leftName = toText(subjectMap.get(left)?.name || subjectMap.get(left)?.code || left).toLowerCase();
      const rightName = toText(subjectMap.get(right)?.name || subjectMap.get(right)?.code || right).toLowerCase();
      return leftName.localeCompare(rightName, 'en', { sensitivity: 'base' });
    });

  return [...orderedFromClass, ...remainingSubjectIds].map((subjectId) => {
    const subject = subjectMap.get(subjectId);
    return {
      subjectId,
      subjectName: toText(subject?.name || subject?.code, 'Subject')
    };
  });
};

const buildMarksLookup = (marksRows = []) => {
  const map = new Map();

  (Array.isArray(marksRows) ? marksRows : []).forEach((item) => {
    const key = `${toId(item?.studentId)}:${toId(item?.subjectId)}:${toId(item?.examId)}`;
    map.set(key, item);
  });

  return map;
};

const getMarkForSlot = ({ marksLookup, studentId, subjectId, examId }) => {
  if (!examId) {
    return null;
  }

  const key = `${studentId}:${subjectId}:${examId}`;
  const row = marksLookup.get(key);
  if (!row) {
    return null;
  }

  const numericMarks = toNumberOrNull(row?.marksObtained);
  if (numericMarks === null) {
    return null;
  }

  return Number(numericMarks.toFixed(2));
};

const compareReportCardRows = (left, right) => {
  const leftTotal = Number(left?.grandTotalObtainedMarks || 0);
  const rightTotal = Number(right?.grandTotalObtainedMarks || 0);
  if (leftTotal !== rightTotal) {
    return rightTotal - leftTotal;
  }

  const leftName = toText(left?.studentName).toLowerCase();
  const rightName = toText(right?.studentName).toLowerCase();
  const nameCompare = leftName.localeCompare(rightName, 'en', { sensitivity: 'base' });
  if (nameCompare !== 0) {
    return nameCompare;
  }

  const leftAdmissionDate = toValidDate(left?.admissionDate)?.getTime() || 0;
  const rightAdmissionDate = toValidDate(right?.admissionDate)?.getTime() || 0;
  if (leftAdmissionDate !== rightAdmissionDate) {
    return leftAdmissionDate - rightAdmissionDate;
  }

  return toId(left?.studentId).localeCompare(toId(right?.studentId));
};

const buildReportCardFileName = ({ assignedRollNo, studentName }) => {
  const safeName = toSafeFileToken(studentName, 'Student');
  const safeRollNo = Number.isFinite(Number(assignedRollNo)) ? String(Math.max(1, Number(assignedRollNo))) : 'NA';
  return `RollNo_${safeRollNo}_${safeName}.pdf`;
};

const buildZipFileName = ({ className, section }) => {
  const safeClassName = toSafeFileToken(className, 'Class');
  const safeSection = toSafeFileToken(section || 'NA', 'NA');
  return `Class_${safeClassName}_Section_${safeSection}_ReportCards.zip`;
};

const calculateClassReportCards = async ({ classId, academicYear, section }) => {
  const normalizedClassId = toId(classId);
  if (!mongoose.Types.ObjectId.isValid(normalizedClassId)) {
    throw createHttpError(400, 'Invalid class selected');
  }

  const normalizedAcademicYear = toText(academicYear);
  if (!normalizedAcademicYear || !ACADEMIC_YEAR_REGEX.test(normalizedAcademicYear)) {
    throw createHttpError(400, 'Academic year must be in YYYY or YYYY-YYYY format');
  }

  const classRecord = await ClassModel.findById(normalizedClassId)
    .select('_id name section subjectIds')
    .lean();

  if (!classRecord) {
    throw createHttpError(404, 'Class not found');
  }

  const normalizedSection = toText(section);
  if (normalizedSection && toText(classRecord.section) !== normalizedSection) {
    throw createHttpError(400, 'Selected section does not match the class section');
  }

  const examRows = await Exam.find({
    classId: normalizedClassId,
    academicYear: normalizedAcademicYear
  })
    .select('_id examName examType status classId subjects schedule subjectId startDate endDate examDate date createdAt')
    .lean();

  const { slotExams, missingSlotLabels } = pickSlotExams(examRows);
  const slotExamIds = Object.values(slotExams)
    .map((item) => toId(item))
    .filter(Boolean);

  const students = await Student.find({ classId: normalizedClassId })
    .select('_id admissionNo rollNo profileImageUrl classId userId createdAt')
    .populate({ path: 'userId', select: 'name email createdAt' })
    .lean();

  const studentIds = students.map((item) => toId(item)).filter(Boolean);

  const marksRows =
    slotExamIds.length > 0 && studentIds.length > 0
      ? await Marks.find({
          classId: normalizedClassId,
          examId: { $in: slotExamIds },
          studentId: { $in: studentIds }
        })
          .select('studentId subjectId examId marksObtained maxMarks')
          .lean()
      : [];

  const collectedSubjectIds = collectSubjectIds({
    classRecord,
    marksRows,
    slotExams
  });

  const subjectRows =
    collectedSubjectIds.length > 0
      ? await Subject.find({ _id: { $in: collectedSubjectIds } })
          .select('_id name code')
          .lean()
      : [];

  const orderedSubjects = buildSubjectOrdering({
    classRecord,
    subjectRows,
    marksRows,
    slotExams
  });

  const marksLookup = buildMarksLookup(marksRows);
  const missingRequirements = [];

  if (missingSlotLabels.length > 0) {
    missingRequirements.push(`Required exams are missing or not completed: ${missingSlotLabels.join(', ')}`);
  }

  if (students.length === 0) {
    missingRequirements.push('No students found in the selected class and section');
  }

  if (orderedSubjects.length === 0) {
    missingRequirements.push('No subjects found for report card calculation');
  }

  let studentsWithIncompleteMarks = 0;

  const reportCards = students.map((student) => {
    const studentId = toId(student);
    const studentName = toText(student?.userId?.name, 'Student');

    const subjectRowsForStudent = orderedSubjects.map((subject) => {
      const unitTest1Marks = getMarkForSlot({
        marksLookup,
        studentId,
        subjectId: subject.subjectId,
        examId: toId(slotExams.unitTest1)
      });

      const unitTest2Marks = getMarkForSlot({
        marksLookup,
        studentId,
        subjectId: subject.subjectId,
        examId: toId(slotExams.unitTest2)
      });

      const finalExamMarks = getMarkForSlot({
        marksLookup,
        studentId,
        subjectId: subject.subjectId,
        examId: toId(slotExams.finalExam)
      });

      const normalizedUnitTest1 =
        unitTest1Marks !== null && unitTest1Marks >= 0 && unitTest1Marks <= REPORT_CARD_SLOTS[0].maxMarks
          ? unitTest1Marks
          : null;
      const normalizedUnitTest2 =
        unitTest2Marks !== null && unitTest2Marks >= 0 && unitTest2Marks <= REPORT_CARD_SLOTS[1].maxMarks
          ? unitTest2Marks
          : null;
      const normalizedFinalExam =
        finalExamMarks !== null && finalExamMarks >= 0 && finalExamMarks <= REPORT_CARD_SLOTS[2].maxMarks
          ? finalExamMarks
          : null;

      const totalObtainedMarks = Number(
        [normalizedUnitTest1, normalizedUnitTest2, normalizedFinalExam]
          .filter((value) => Number.isFinite(value))
          .reduce((sum, value) => sum + Number(value), 0)
          .toFixed(2)
      );

      const isComplete =
        normalizedUnitTest1 !== null &&
        normalizedUnitTest2 !== null &&
        normalizedFinalExam !== null;

      return {
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        unitTest1Marks: normalizedUnitTest1,
        unitTest2Marks: normalizedUnitTest2,
        finalExamMarks: normalizedFinalExam,
        totalMaxMarks: TOTAL_MAX_PER_SUBJECT,
        totalObtainedMarks,
        isComplete
      };
    });

    const isComplete = subjectRowsForStudent.every((row) => row.isComplete);
    if (!isComplete) {
      studentsWithIncompleteMarks += 1;
    }

    const grandTotalMaxMarks = subjectRowsForStudent.reduce((sum, row) => sum + Number(row.totalMaxMarks || 0), 0);
    const grandTotalObtainedMarks = Number(
      subjectRowsForStudent.reduce((sum, row) => sum + Number(row.totalObtainedMarks || 0), 0).toFixed(2)
    );

    return {
      studentId,
      studentName,
      admissionNo: toText(student?.admissionNo, '-'),
      studentProfileImageUrl: toText(student?.profileImageUrl),
      className: toText(classRecord?.name, 'Class'),
      section: toText(classRecord?.section, '-'),
      examYear: normalizedAcademicYear,
      admissionDate: student?.userId?.createdAt || student?.createdAt || null,
      subjectRows: subjectRowsForStudent,
      grandTotalMaxMarks,
      grandTotalObtainedMarks,
      isComplete,
      assignedRollNo: null
    };
  });

  if (studentsWithIncompleteMarks > 0) {
    missingRequirements.push('All subjects must have Unit Test 1, Unit Test 2, and Final marks for every student');
  }

  const isMarksFinalized = missingRequirements.length === 0;

  if (isMarksFinalized) {
    const ranked = [...reportCards].sort(compareReportCardRows);
    ranked.forEach((item, index) => {
      item.assignedRollNo = index + 1;
    });

    const rollNumberMap = new Map(ranked.map((item) => [item.studentId, item.assignedRollNo]));
    reportCards.forEach((item) => {
      item.assignedRollNo = rollNumberMap.get(item.studentId) || null;
    });
  }

  const sortedReportCards = isMarksFinalized
    ? [...reportCards].sort((left, right) => Number(left.assignedRollNo || 0) - Number(right.assignedRollNo || 0))
    : [...reportCards].sort(compareReportCardRows);

  return {
    classInfo: {
      classId: normalizedClassId,
      className: toText(classRecord?.name, 'Class'),
      section: toText(classRecord?.section, '-')
    },
    academicYear: normalizedAcademicYear,
    slotExams: {
      unitTest1: slotExams.unitTest1
        ? {
            examId: toId(slotExams.unitTest1),
            examName: toText(slotExams.unitTest1?.examName, 'Unit Test 1')
          }
        : null,
      unitTest2: slotExams.unitTest2
        ? {
            examId: toId(slotExams.unitTest2),
            examName: toText(slotExams.unitTest2?.examName, 'Unit Test 2')
          }
        : null,
      finalExam: slotExams.finalExam
        ? {
            examId: toId(slotExams.finalExam),
            examName: toText(slotExams.finalExam?.examName, 'Final Exam')
          }
        : null
    },
    isMarksFinalized,
    missingRequirements,
    reportCards: sortedReportCards
  };
};

const getStudentReportCardByExam = async ({ examId, studentId }) => {
  const normalizedExamId = toId(examId);
  const normalizedStudentId = toId(studentId);

  if (!mongoose.Types.ObjectId.isValid(normalizedExamId)) {
    throw createHttpError(400, 'Invalid exam selected');
  }

  if (!mongoose.Types.ObjectId.isValid(normalizedStudentId)) {
    throw createHttpError(400, 'Invalid student selected');
  }

  const exam = await Exam.findById(normalizedExamId)
    .select('_id classId academicYear')
    .lean();

  if (!exam) {
    throw createHttpError(404, 'Exam not found');
  }

  const student = await Student.findById(normalizedStudentId)
    .select('_id classId')
    .lean();

  if (!student) {
    throw createHttpError(404, 'Student not found');
  }

  if (toId(student.classId) !== toId(exam.classId)) {
    throw createHttpError(403, 'Forbidden');
  }

  const dataset = await calculateClassReportCards({
    classId: exam.classId,
    academicYear: exam.academicYear
  });

  const reportCard = dataset.reportCards.find((item) => item.studentId === normalizedStudentId) || null;
  if (!reportCard) {
    throw createHttpError(404, 'Report card data not found for this student');
  }

  const isDownloadReady = Boolean(dataset.isMarksFinalized && reportCard.isComplete && Number.isFinite(reportCard.assignedRollNo));
  const reason = isDownloadReady
    ? ''
    : dataset.missingRequirements[0] || 'Report card download is not available until all marks are finalized';

  return {
    dataset,
    reportCard,
    isDownloadReady,
    reason,
    fileName: buildReportCardFileName({
      assignedRollNo: reportCard.assignedRollNo,
      studentName: reportCard.studentName
    })
  };
};

const getClassReportCardsZipPayload = async ({ classId, academicYear, section }) => {
  const dataset = await calculateClassReportCards({ classId, academicYear, section });

  if (!dataset.isMarksFinalized) {
    throw createHttpError(
      409,
      dataset.missingRequirements[0] || 'Report cards are not ready. Finalize marks for all students first.'
    );
  }

  return {
    ...dataset,
    zipFileName: buildZipFileName({
      className: dataset.classInfo.className,
      section: dataset.classInfo.section
    })
  };
};

module.exports = {
  REPORT_CARD_SLOTS,
  TOTAL_MAX_PER_SUBJECT,
  calculateClassReportCards,
  getStudentReportCardByExam,
  getClassReportCardsZipPayload,
  buildReportCardFileName
};