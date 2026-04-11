const mongoose = require('mongoose');
const Exam = require('../models/exam.model');
const ClassModel = require('../models/class.model');
const Student = require('../models/student.model');
const Subject = require('../models/subject.model');
const Marks = require('../models/marks.model');
const { calculateGrade } = require('../utils/gradeCalculator');

const ACADEMIC_YEAR_REGEX = /^\d{4}$/;

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

const toNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toValidDate = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const toSafeFileToken = (value, fallback = 'Value') => {
  const normalized = toText(value).replace(/[^A-Za-z0-9_-]/g, '_');
  return normalized || fallback;
};

const deriveNetPerformance = ({ grandTotalObtainedMarks, grandTotalMaxMarks }) => {
  const obtained = Number(grandTotalObtainedMarks);
  const total = Number(grandTotalMaxMarks);

  if (!Number.isFinite(obtained) || !Number.isFinite(total) || total <= 0) {
    return {
      netGrade: '-',
      netPercentage: null
    };
  }

  try {
    const result = calculateGrade(obtained, total);
    return {
      netGrade: toText(result?.grade, '-'),
      netPercentage: Number.isFinite(Number(result?.percentage)) ? Number(result.percentage) : null
    };
  } catch (_error) {
    return {
      netGrade: '-',
      netPercentage: null
    };
  }
};

const toExamTimestamp = (exam = {}) => {
  const dateValue = exam?.endDate || exam?.startDate || exam?.examDate || exam?.date || exam?.createdAt;
  const parsed = toValidDate(dateValue);
  return parsed ? parsed.getTime() : 0;
};

const getExamSearchText = (exam = {}) =>
  `${toText(exam?.examName)} ${toText(exam?.description)} ${toText(exam?.examType)}`.toLowerCase();

const isFinalExam = (exam = {}) => {
  const searchText = getExamSearchText(exam);

  // Prevent common non-final terms from being classified as final scope.
  if (/\bhalf\s*[- ]?\s*yearly\b|\bhalfyearly\b|\bmid\s*[- ]?\s*yearly\b|\bmidyearly\b/.test(searchText)) {
    return false;
  }

  const examType = toText(exam?.examType).toLowerCase();
  if (examType === 'final exam' || examType === 'final') {
    return true;
  }

  return /\bfinal exam\b|\bfinal\b|\bannual\b|\byearly\b/.test(searchText);
};

const isExamCompleted = (exam = {}) => {
  const normalizedStatus = toText(exam?.status).toLowerCase();
  if (normalizedStatus === 'completed') {
    return true;
  }

  const endDate = toValidDate(exam?.endDate || exam?.startDate || exam?.examDate || exam?.date);
  if (!endDate) {
    return false;
  }

  return endDate.getTime() <= Date.now();
};

const getExamIncludedSubjectIds = (exam = {}) => {
  const subjectIdSet = new Set();

  const scheduleSubjectIds = Array.isArray(exam?.schedule)
    ? exam.schedule.map((item) => toId(item?.subjectId)).filter(Boolean)
    : [];

  const subjectIds = Array.isArray(exam?.subjects)
    ? exam.subjects.map((item) => toId(item)).filter(Boolean)
    : [];

  [...scheduleSubjectIds, ...subjectIds, toId(exam?.subjectId)]
    .filter(Boolean)
    .forEach((subjectId) => subjectIdSet.add(subjectId));

  return subjectIdSet;
};

const buildMarksLookup = (marksRows = []) => {
  const lookup = new Map();

  (Array.isArray(marksRows) ? marksRows : []).forEach((item) => {
    const key = `${toId(item?.studentId)}:${toId(item?.subjectId)}:${toId(item?.examId)}`;
    lookup.set(key, item);
  });

  return lookup;
};

const toModeNumber = (values = []) => {
  const frequencyMap = new Map();

  (Array.isArray(values) ? values : [])
    .map((item) => toNumberOrNull(item))
    .filter((value) => Number.isFinite(value) && value > 0)
    .forEach((value) => {
      const normalizedValue = Number(value.toFixed(2));
      const key = normalizedValue.toString();
      const current = frequencyMap.get(key) || { value: normalizedValue, count: 0 };
      current.count += 1;
      frequencyMap.set(key, current);
    });

  const ranked = Array.from(frequencyMap.values()).sort((left, right) => {
    if (left.count !== right.count) {
      return right.count - left.count;
    }

    return right.value - left.value;
  });

  return ranked[0]?.value ?? null;
};

const buildExamColumns = ({ completedExams = [], marksRows = [] }) => {
  const rows = Array.isArray(marksRows) ? marksRows : [];

  return [...completedExams]
    .sort((left, right) => toExamTimestamp(left) - toExamTimestamp(right))
    .map((exam) => {
      const examId = toId(exam);
      const examName = toText(exam?.examName || exam?.description, 'Exam');
      const subjectIdSet = getExamIncludedSubjectIds(exam);

      const examRows = rows.filter((item) => toId(item?.examId) === examId);
      if (subjectIdSet.size === 0) {
        examRows
          .map((item) => toId(item?.subjectId))
          .filter(Boolean)
          .forEach((subjectId) => subjectIdSet.add(subjectId));
      }

      const columnMaxMarks = toModeNumber(examRows.map((item) => item?.maxMarks));

      return {
        examId,
        examName,
        maxMarks: columnMaxMarks,
        subjectIdSet
      };
    });
};

const selectLatestCompletedFinalExam = (exams = []) =>
  [...(Array.isArray(exams) ? exams : [])]
    .filter((item) => isFinalExam(item) && isExamCompleted(item))
    .sort((left, right) => toExamTimestamp(right) - toExamTimestamp(left))[0] || null;

const selectExamsUpToFinal = ({ allClassExams = [], finalExam = null }) => {
  const finalExamId = toId(finalExam);
  if (!finalExamId) {
    return [];
  }

  const finalExamTimestamp = toExamTimestamp(finalExam);
  const finalExamAcademicYear = toText(finalExam?.academicYear);

  return [...(Array.isArray(allClassExams) ? allClassExams : [])]
    .filter((item) => {
      const examId = toId(item);
      if (!examId) {
        return false;
      }

      if (finalExamAcademicYear && toText(item?.academicYear) !== finalExamAcademicYear) {
        return false;
      }

      if (examId === finalExamId) {
        return true;
      }

      const examTimestamp = toExamTimestamp(item);
      if (finalExamTimestamp > 0 && examTimestamp > 0) {
        return examTimestamp <= finalExamTimestamp;
      }

      return isExamCompleted(item);
    })
    .sort((left, right) => toExamTimestamp(left) - toExamTimestamp(right));
};

const collectSubjectIds = ({ classRecord = {}, examColumns = [], marksRows = [] }) => {
  const subjectIdSet = new Set(
    Array.isArray(classRecord?.subjectIds)
      ? classRecord.subjectIds.map((item) => toId(item)).filter(Boolean)
      : []
  );

  (Array.isArray(examColumns) ? examColumns : []).forEach((item) => {
    (item?.subjectIdSet instanceof Set ? Array.from(item.subjectIdSet) : [])
      .filter(Boolean)
      .forEach((subjectId) => subjectIdSet.add(subjectId));
  });

  (Array.isArray(marksRows) ? marksRows : [])
    .map((item) => toId(item?.subjectId))
    .filter(Boolean)
    .forEach((subjectId) => subjectIdSet.add(subjectId));

  return Array.from(subjectIdSet);
};

const buildSubjectOrdering = ({ classRecord = {}, subjectRows = [] }) => {
  const classSubjectIds = Array.isArray(classRecord?.subjectIds)
    ? classRecord.subjectIds.map((item) => toId(item)).filter(Boolean)
    : [];

  const subjectMap = new Map((Array.isArray(subjectRows) ? subjectRows : []).map((item) => [toId(item), item]));

  const orderedFromClass = classSubjectIds
    .filter((subjectId) => subjectMap.has(subjectId))
    .map((subjectId) => ({
      subjectId,
      subjectName: toText(subjectMap.get(subjectId)?.name || subjectMap.get(subjectId)?.code, 'Subject')
    }));

  const remaining = Array.from(subjectMap.keys())
    .filter((subjectId) => !classSubjectIds.includes(subjectId))
    .sort((left, right) => {
      const leftName = toText(subjectMap.get(left)?.name || subjectMap.get(left)?.code, left).toLowerCase();
      const rightName = toText(subjectMap.get(right)?.name || subjectMap.get(right)?.code, right).toLowerCase();
      return leftName.localeCompare(rightName, 'en', { sensitivity: 'base' });
    })
    .map((subjectId) => ({
      subjectId,
      subjectName: toText(subjectMap.get(subjectId)?.name || subjectMap.get(subjectId)?.code, 'Subject')
    }));

  return [...orderedFromClass, ...remaining];
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
  const rollNumber = Number.isFinite(Number(assignedRollNo)) ? String(Math.max(1, Number(assignedRollNo))) : 'NA';
  const safeStudentName = toSafeFileToken(studentName, 'Student');
  return `RollNo_${rollNumber}_${safeStudentName}.pdf`;
};

const buildZipFileName = ({ className, section }) => {
  const safeClassName = toSafeFileToken(className, 'Class');
  const safeSection = toSafeFileToken(section || 'NA', 'NA');
  return `Class_${safeClassName}_Section_${safeSection}_ReportCards.zip`;
};

const calculateClassReportCards = async ({ classId, academicYear, section, selectedExamId = '' }) => {
  const normalizedClassId = toId(classId);
  if (!mongoose.Types.ObjectId.isValid(normalizedClassId)) {
    throw createHttpError(400, 'Invalid class selected');
  }

  const normalizedAcademicYear = toText(academicYear);
  if (normalizedAcademicYear && !ACADEMIC_YEAR_REGEX.test(normalizedAcademicYear)) {
    throw createHttpError(400, 'Academic year must be in YYYY format');
  }

  const normalizedSelectedExamId = toId(selectedExamId);
  if (normalizedSelectedExamId && !mongoose.Types.ObjectId.isValid(normalizedSelectedExamId)) {
    throw createHttpError(400, 'Invalid exam selected');
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

  const examFilter = { classId: normalizedClassId };
  if (normalizedAcademicYear) {
    examFilter.academicYear = normalizedAcademicYear;
  }

  const allClassExams = await Exam.find(examFilter)
    .select('_id examName description examType status classId subjects schedule subjectId startDate endDate examDate date createdAt')
    .lean();

  const selectedExam = normalizedSelectedExamId
    ? allClassExams.find((item) => toId(item) === normalizedSelectedExamId) || null
    : null;

  if (normalizedSelectedExamId && !selectedExam) {
    throw createHttpError(
      404,
      normalizedAcademicYear ? 'Exam not found for the selected class and exam year' : 'Exam not found for the selected class'
    );
  }

  if (selectedExam && !isFinalExam(selectedExam)) {
    throw createHttpError(409, 'Report card can be generated only for Final Exam');
  }

  const finalExam = selectedExam || selectLatestCompletedFinalExam(allClassExams);
  const resolvedAcademicYear = toText(finalExam?.academicYear, normalizedAcademicYear);
  const scopedExams = selectExamsUpToFinal({
    allClassExams,
    finalExam
  });

  const examIds = scopedExams.map((item) => toId(item)).filter(Boolean);

  const students = await Student.find({ classId: normalizedClassId })
    .select('_id admissionNo profileImageUrl classId userId createdAt')
    .populate({ path: 'userId', select: 'name email createdAt' })
    .lean();

  const studentIds = students.map((item) => toId(item)).filter(Boolean);

  const marksRows =
    examIds.length > 0 && studentIds.length > 0
      ? await Marks.find({
          classId: normalizedClassId,
          examId: { $in: examIds },
          studentId: { $in: studentIds }
        })
          .select('studentId subjectId examId marksObtained maxMarks')
          .lean()
      : [];

  const examColumns = buildExamColumns({
    completedExams: scopedExams,
    marksRows
  });

  const subjectIds = collectSubjectIds({
    classRecord,
    examColumns,
    marksRows
  });

  const subjectRows =
    subjectIds.length > 0
      ? await Subject.find({ _id: { $in: subjectIds } })
          .select('_id name code')
          .lean()
      : [];

  const orderedSubjects = buildSubjectOrdering({
    classRecord,
    subjectRows
  }).filter((subject) =>
    examColumns.some((column) =>
      column.subjectIdSet.size === 0 || column.subjectIdSet.has(subject.subjectId)
    )
  );

  const marksLookup = buildMarksLookup(marksRows);

  const subjectExamMaxMap = new Map();
  const groupedMaxRows = new Map();

  marksRows.forEach((item) => {
    const key = `${toId(item?.subjectId)}:${toId(item?.examId)}`;
    if (!groupedMaxRows.has(key)) {
      groupedMaxRows.set(key, []);
    }
    groupedMaxRows.get(key).push(item?.maxMarks);
  });

  Array.from(groupedMaxRows.entries()).forEach(([key, values]) => {
    const modeMax = toModeNumber(values);
    if (Number.isFinite(modeMax) && modeMax > 0) {
      subjectExamMaxMap.set(key, modeMax);
    }
  });

  const missingRequirements = [];
  if (!finalExam) {
    missingRequirements.push(
      normalizedAcademicYear
        ? 'Report cards can be generated only after Final Exam is completed for the selected class and exam year'
        : 'Report cards can be generated only after Final Exam is completed for the selected class'
    );
  } else if (!isExamCompleted(finalExam)) {
    missingRequirements.push('Report cards can be generated only after Final Exam is completed');
  }

  if (finalExam && scopedExams.length === 0) {
    missingRequirements.push('No exam data found before Final Exam for report card generation');
  }

  if (students.length === 0) {
    missingRequirements.push('No students found in the selected class and section');
  }

  if (orderedSubjects.length === 0) {
    missingRequirements.push('No subjects found for report card calculation');
  }

  const missingMaxPairs = new Set();
  let studentsWithIncompleteMarks = 0;

  const reportCards = students.map((student) => {
    const studentId = toId(student);
    const studentName = toText(student?.userId?.name, 'Student');

    const subjectRowsForStudent = orderedSubjects.map((subject) => {
      let totalMaxMarks = 0;
      let totalObtainedMarks = 0;
      let subjectIsComplete = true;

      const examMarks = {};

      examColumns.forEach((examColumn) => {
        const examId = examColumn.examId;
        const applicable = examColumn.subjectIdSet.size === 0 || examColumn.subjectIdSet.has(subject.subjectId);

        if (!applicable) {
          examMarks[examId] = {
            applicable: false,
            obtainedMarks: null,
            maxMarks: null
          };
          return;
        }

        const subjectExamKey = `${subject.subjectId}:${examId}`;
        const expectedMaxMarks = subjectExamMaxMap.get(subjectExamKey) ?? examColumn.maxMarks ?? null;

        if (!Number.isFinite(expectedMaxMarks) || Number(expectedMaxMarks) <= 0) {
          subjectIsComplete = false;
          missingMaxPairs.add(`${subject.subjectName} - ${examColumn.examName}`);
          examMarks[examId] = {
            applicable: true,
            obtainedMarks: null,
            maxMarks: null
          };
          return;
        }

        totalMaxMarks += Number(expectedMaxMarks);

        const markRow = marksLookup.get(`${studentId}:${subject.subjectId}:${examId}`);
        const obtainedMarks = toNumberOrNull(markRow?.marksObtained);

        if (!Number.isFinite(obtainedMarks)) {
          subjectIsComplete = false;
          examMarks[examId] = {
            applicable: true,
            obtainedMarks: null,
            maxMarks: Number(expectedMaxMarks)
          };
          return;
        }

        if (obtainedMarks < 0 || obtainedMarks > Number(expectedMaxMarks)) {
          subjectIsComplete = false;
        }

        totalObtainedMarks += Number(obtainedMarks);
        examMarks[examId] = {
          applicable: true,
          obtainedMarks: Number(obtainedMarks.toFixed(2)),
          maxMarks: Number(Number(expectedMaxMarks).toFixed(2))
        };
      });

      return {
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        examMarks,
        totalMaxMarks: Number(totalMaxMarks.toFixed(2)),
        totalObtainedMarks: Number(totalObtainedMarks.toFixed(2)),
        isComplete: subjectIsComplete
      };
    });

    const isComplete = subjectRowsForStudent.every((item) => item.isComplete);
    if (!isComplete) {
      studentsWithIncompleteMarks += 1;
    }

    const grandTotalMaxMarks = Number(
      subjectRowsForStudent.reduce((sum, item) => sum + Number(item.totalMaxMarks || 0), 0).toFixed(2)
    );

    const grandTotalObtainedMarks = Number(
      subjectRowsForStudent.reduce((sum, item) => sum + Number(item.totalObtainedMarks || 0), 0).toFixed(2)
    );

    const netPerformance = deriveNetPerformance({
      grandTotalObtainedMarks,
      grandTotalMaxMarks
    });

    return {
      studentId,
      studentName,
      admissionNo: toText(student?.admissionNo, '-'),
      studentProfileImageUrl: toText(student?.profileImageUrl),
      className: toText(classRecord?.name, 'Class'),
      section: toText(classRecord?.section, '-'),
      examYear: resolvedAcademicYear,
      admissionDate: student?.userId?.createdAt || student?.createdAt || null,
      examColumns: examColumns.map((column) => ({
        examId: column.examId,
        examName: column.examName,
        maxMarks: Number.isFinite(Number(column.maxMarks)) ? Number(column.maxMarks) : null,
        subjectIds: Array.from(column.subjectIdSet)
      })),
      subjectRows: subjectRowsForStudent,
      grandTotalMaxMarks,
      grandTotalObtainedMarks,
      netGrade: netPerformance.netGrade,
      netPercentage: netPerformance.netPercentage,
      isComplete,
      assignedRollNo: null
    };
  });

  if (missingMaxPairs.size > 0) {
    missingRequirements.push('One or more exam max marks are missing. Enter marks for all exam-subject combinations first.');
  }

  if (studentsWithIncompleteMarks > 0) {
    missingRequirements.push('All subjects must have marks for all exams up to Final Exam before report cards can be finalized');
  }

  const isMarksFinalized = missingRequirements.length === 0;

  const orderedReportCards = [...reportCards].sort(compareReportCardRows);

  if (isMarksFinalized) {
    orderedReportCards.forEach((item, index) => {
      item.assignedRollNo = index + 1;
    });
  }

  const sortedReportCards = isMarksFinalized
    ? [...orderedReportCards].sort((left, right) => Number(left.assignedRollNo || 0) - Number(right.assignedRollNo || 0))
    : orderedReportCards;

  return {
    classInfo: {
      classId: normalizedClassId,
      className: toText(classRecord?.name, 'Class'),
      section: toText(classRecord?.section, '-')
    },
    academicYear: resolvedAcademicYear,
    completedExams: examColumns.map((column) => ({
      examId: column.examId,
      examName: column.examName,
      maxMarks: Number.isFinite(Number(column.maxMarks)) ? Number(column.maxMarks) : null
    })),
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
    .select('_id classId academicYear examType examName description status startDate endDate examDate date')
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

  if (!isFinalExam(exam)) {
    return {
      dataset: null,
      reportCard: null,
      isDownloadReady: false,
      reason: 'Report card can be generated only after Final Exam.',
      fileName: 'Report_Card.pdf'
    };
  }

  const dataset = await calculateClassReportCards({
    classId: exam.classId,
    academicYear: exam.academicYear,
    selectedExamId: normalizedExamId
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
  calculateClassReportCards,
  getStudentReportCardByExam,
  getClassReportCardsZipPayload,
  buildReportCardFileName
};
