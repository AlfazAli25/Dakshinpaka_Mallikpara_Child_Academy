const mongoose = require('mongoose');
const AdmitCard = require('../models/admit-card.model');
const Exam = require('../models/exam.model');
const Student = require('../models/student.model');
const Notice = require('../models/notice.model');
const NoticePayment = require('../models/notice-payment.model');

const VERIFIED_NOTICE_PAYMENT_STATUSES = new Set(['VERIFIED', 'PAID']);
const ADMIT_CARD_NOTICE_TITLE = 'Admit Card Available';
const ADMIT_CARD_NOTICE_ACTION_LABEL = 'Download Admit Card';

const toId = (value) => String(value?._id || value || '').trim();

const toMoney = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return Number(numeric.toFixed(2));
};

const toDate = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const toDisplayDate = (value) => {
  const parsed = toDate(value);
  if (!parsed) {
    return '-';
  }

  return parsed.toLocaleDateString('en-GB');
};

const buildScheduleSnapshot = (exam = {}) => {
  const scheduleRows = Array.isArray(exam?.schedule) ? exam.schedule : [];

  return scheduleRows
    .map((item) => {
      const startDate = toDate(item?.startDate);
      const endDate = toDate(item?.endDate);
      if (!startDate || !endDate) {
        return null;
      }

      return {
        subjectId: item?.subjectId?._id || item?.subjectId,
        subjectName: String(item?.subjectId?.name || item?.subjectId?.code || 'Subject').trim(),
        startDate,
        endDate
      };
    })
    .filter(Boolean)
    .sort((left, right) => new Date(left.startDate).getTime() - new Date(right.startDate).getTime());
};

const deriveDownloadEnabled = ({ isActive, isFeePaid, isStudentEligible }) =>
  Boolean(isActive && isFeePaid && isStudentEligible);

const applyEligibilityState = (admitCardDoc, checkedAt = new Date()) => {
  const shouldEnableDownload = deriveDownloadEnabled({
    isActive: admitCardDoc.isActive,
    isFeePaid: admitCardDoc.isFeePaid,
    isStudentEligible: admitCardDoc.isStudentEligible
  });

  admitCardDoc.isDownloadEnabled = shouldEnableDownload;
  admitCardDoc.status = shouldEnableDownload ? 'AVAILABLE' : 'WAITING_ELIGIBILITY';
  admitCardDoc.lastEligibilityCheckedAt = checkedAt;

  if (shouldEnableDownload) {
    if (!admitCardDoc.availableAt) {
      admitCardDoc.availableAt = checkedAt;
    }
    return;
  }

  admitCardDoc.availableAt = undefined;
};

const ensureFeeNoticeCreatorId = ({ actorUserId, exam, fallbackCreatedBy }) => {
  const actorId = toId(actorUserId);
  if (actorId) {
    return actorId;
  }

  const examCreatorId = toId(exam?.createdBy);
  if (examCreatorId) {
    return examCreatorId;
  }

  const fallbackCreatorId = toId(fallbackCreatedBy);
  return fallbackCreatorId || null;
};

const ensureAdmitCardFeeNotice = async ({ exam, actorUserId }) => {
  const examId = toId(exam?._id);
  if (!examId) {
    return null;
  }

  const classId = toId(exam?.classId);
  const feeAmount = toMoney(exam?.admitCardFeeAmount);

  const existingNotice = await Notice.findOne({
    admitCardExamId: examId,
    noticeType: 'Payment',
    sourceType: 'ADMIT_CARD_SYSTEM'
  });

  if (feeAmount <= 0) {
    if (existingNotice && existingNotice.status === 'Active') {
      existingNotice.status = 'Expired';
      await existingNotice.save();
    }

    return null;
  }

  const createdBy = ensureFeeNoticeCreatorId({
    actorUserId,
    exam,
    fallbackCreatedBy: existingNotice?.createdBy
  });

  if (!createdBy) {
    throw new Error('Admit card fee notice requires a valid creator user');
  }

  const examName = String(exam?.examName || 'Exam').trim() || 'Exam';
  const title = `Admit Card Fee - ${examName}`;
  const description =
    `Pay the admit card fee to unlock admit card download for ${examName}. ` +
    `Amount: INR ${feeAmount.toFixed(2)}.`;

  const payload = {
    title,
    description,
    recipientRole: 'student',
    classIds: classId ? [classId] : [],
    studentIds: [],
    noticeType: 'Payment',
    amount: feeAmount,
    dueDate: exam?.startDate || exam?.date || exam?.examDate || undefined,
    isImportant: true,
    status: 'Active',
    createdBy,
    sourceType: 'ADMIT_CARD_SYSTEM',
    actionType: 'NONE',
    actionLabel: '',
    actionPath: '',
    admitCardExamId: examId
  };

  if (!existingNotice) {
    return Notice.create(payload);
  }

  existingNotice.title = payload.title;
  existingNotice.description = payload.description;
  existingNotice.recipientRole = payload.recipientRole;
  existingNotice.classIds = payload.classIds;
  existingNotice.studentIds = payload.studentIds;
  existingNotice.noticeType = payload.noticeType;
  existingNotice.amount = payload.amount;
  existingNotice.dueDate = payload.dueDate;
  existingNotice.isImportant = payload.isImportant;
  existingNotice.status = payload.status;
  existingNotice.sourceType = payload.sourceType;
  existingNotice.actionType = payload.actionType;
  existingNotice.actionLabel = payload.actionLabel;
  existingNotice.actionPath = payload.actionPath;
  existingNotice.admitCardExamId = payload.admitCardExamId;

  await existingNotice.save();
  return existingNotice;
};

const getPaidStudentIdSetForFeeNotice = async ({ feeNoticeId, studentIds = [] }) => {
  const normalizedNoticeId = toId(feeNoticeId);
  if (!normalizedNoticeId || studentIds.length === 0) {
    return new Set();
  }

  const paidRows = await NoticePayment.find({
    noticeId: normalizedNoticeId,
    studentId: { $in: studentIds },
    paymentStatus: { $in: ['VERIFIED', 'PAID'] }
  })
    .select('studentId')
    .lean();

  return new Set(paidRows.map((item) => toId(item.studentId)).filter(Boolean));
};

const getAdmitCardNoticeDescription = ({ examName, academicYear, examStartDate }) => {
  const safeExamName = String(examName || 'upcoming examination').trim() || 'upcoming examination';
  const safeAcademicYear = String(academicYear || '').trim();
  const examDateLabel = toDisplayDate(examStartDate);

  const yearText = safeAcademicYear ? ` (${safeAcademicYear})` : '';
  const dateText = examDateLabel !== '-' ? ` Exam starts on ${examDateLabel}.` : '';

  return `Your Admit Card for ${safeExamName}${yearText} is now available for download.${dateText}`;
};

const ensureAdmitCardAvailabilityNotice = async ({ admitCard, exam, student, actorUserId }) => {
  let existingNotice = null;

  if (admitCard.noticeId) {
    existingNotice = await Notice.findById(admitCard.noticeId);
  }

  if (!existingNotice) {
    existingNotice = await Notice.findOne({ admitCardId: admitCard._id });
  }

  if (!admitCard.isDownloadEnabled || !admitCard.isActive) {
    if (existingNotice && existingNotice.status === 'Active') {
      existingNotice.status = 'Expired';
      await existingNotice.save();
    }
    return;
  }

  const createdBy = ensureFeeNoticeCreatorId({
    actorUserId,
    exam,
    fallbackCreatedBy: existingNotice?.createdBy || admitCard?.createdBy
  });

  if (!createdBy) {
    throw new Error('Admit card availability notice requires a valid creator user');
  }

  const payload = {
    title: ADMIT_CARD_NOTICE_TITLE,
    description: getAdmitCardNoticeDescription({
      examName: admitCard.examName || exam?.examName,
      academicYear: admitCard.academicYear || exam?.academicYear,
      examStartDate: admitCard.examStartDate || exam?.startDate
    }),
    recipientRole: 'student',
    classIds: [],
    studentIds: [admitCard.studentId],
    noticeType: 'General',
    isImportant: true,
    status: 'Active',
    createdBy,
    sourceType: 'ADMIT_CARD_SYSTEM',
    actionType: 'ADMIT_CARD_DOWNLOAD',
    actionLabel: ADMIT_CARD_NOTICE_ACTION_LABEL,
    actionPath: `/admit-cards/${admitCard._id}/download`,
    admitCardId: admitCard._id,
    admitCardExamId: admitCard.examId
  };

  if (!existingNotice) {
    existingNotice = await Notice.create(payload);
  } else {
    existingNotice.title = payload.title;
    existingNotice.description = payload.description;
    existingNotice.recipientRole = payload.recipientRole;
    existingNotice.classIds = payload.classIds;
    existingNotice.studentIds = payload.studentIds;
    existingNotice.noticeType = payload.noticeType;
    existingNotice.amount = undefined;
    existingNotice.dueDate = undefined;
    existingNotice.isImportant = payload.isImportant;
    existingNotice.status = payload.status;
    existingNotice.sourceType = payload.sourceType;
    existingNotice.actionType = payload.actionType;
    existingNotice.actionLabel = payload.actionLabel;
    existingNotice.actionPath = payload.actionPath;
    existingNotice.admitCardId = payload.admitCardId;
    existingNotice.admitCardExamId = payload.admitCardExamId;
    await existingNotice.save();
  }

  admitCard.noticeId = existingNotice._id;
  admitCard.noticePublishedAt = new Date();
  await admitCard.save();
};

const syncAdmitCardsForExam = async ({ examId, actorUserId }) => {
  const normalizedExamId = toId(examId);
  if (!mongoose.Types.ObjectId.isValid(normalizedExamId)) {
    throw new Error('Invalid examId for admit card sync');
  }

  const exam = await Exam.findById(normalizedExamId)
    .populate({ path: 'classId', select: 'name section' })
    .populate({ path: 'schedule.subjectId', select: 'name code' })
    .lean();

  if (!exam) {
    return {
      synced: 0,
      created: 0,
      updated: 0,
      deactivated: 0
    };
  }

  const classId = toId(exam.classId);
  if (!classId) {
    return {
      synced: 0,
      created: 0,
      updated: 0,
      deactivated: 0
    };
  }

  const students = await Student.find({ classId })
    .select('_id userId admissionNo rollNo classId')
    .populate({ path: 'userId', select: 'name email' })
    .lean();

  const feeNotice = await ensureAdmitCardFeeNotice({ exam, actorUserId });
  const feeNoticeId = toId(feeNotice?._id);
  const feeAmount = toMoney(exam.admitCardFeeAmount);

  const studentIds = students.map((item) => item._id);
  const paidStudentIdSet =
    feeAmount <= 0
      ? new Set(students.map((item) => toId(item._id)).filter(Boolean))
      : await getPaidStudentIdSetForFeeNotice({ feeNoticeId, studentIds });

  const existingCards = await AdmitCard.find({ examId: normalizedExamId });
  const cardByStudentId = new Map(existingCards.map((item) => [toId(item.studentId), item]));
  const activeStudentIdSet = new Set(students.map((item) => toId(item._id)).filter(Boolean));

  const scheduleSnapshot = buildScheduleSnapshot(exam);
  const examStartDate = exam.startDate || exam.date || exam.examDate || null;
  const examEndDate = exam.endDate || examStartDate || null;

  let created = 0;
  let updated = 0;
  let deactivated = 0;

  for (const student of students) {
    const studentId = toId(student._id);
    const existingCard = cardByStudentId.get(studentId) || null;

    const admitCard =
      existingCard ||
      new AdmitCard({
        examId: normalizedExamId,
        studentId,
        classId,
        createdBy: actorUserId || exam.createdBy
      });

    admitCard.classId = classId;
    admitCard.examName = String(exam.examName || '').trim() || 'Exam';
    admitCard.academicYear = String(exam.academicYear || '').trim();
    admitCard.examStartDate = examStartDate || undefined;
    admitCard.examEndDate = examEndDate || undefined;
    admitCard.scheduleSnapshot = scheduleSnapshot;
    admitCard.admitCardFeeAmount = feeAmount;
    admitCard.feeNoticeId = feeNoticeId || undefined;
    admitCard.isFeePaid = feeAmount <= 0 ? true : paidStudentIdSet.has(studentId);
    admitCard.isActive = true;

    applyEligibilityState(admitCard);
    await admitCard.save();

    await ensureAdmitCardAvailabilityNotice({
      admitCard,
      exam,
      student,
      actorUserId
    });

    if (existingCard) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  for (const card of existingCards) {
    const cardStudentId = toId(card.studentId);
    if (activeStudentIdSet.has(cardStudentId)) {
      continue;
    }

    card.isActive = false;
    applyEligibilityState(card);
    await card.save();

    await ensureAdmitCardAvailabilityNotice({
      admitCard: card,
      exam,
      student: null,
      actorUserId
    });

    deactivated += 1;
  }

  return {
    synced: created + updated,
    created,
    updated,
    deactivated
  };
};

const updateAdmitCardEligibility = async ({ admitCardId, isEligible, actorUserId }) => {
  const admitCard = await AdmitCard.findById(admitCardId);
  if (!admitCard || !admitCard.isActive) {
    const error = new Error('Admit card not found');
    error.statusCode = 404;
    throw error;
  }

  admitCard.isStudentEligible = Boolean(isEligible);
  applyEligibilityState(admitCard);
  await admitCard.save();

  const [exam, student] = await Promise.all([
    Exam.findById(admitCard.examId).lean(),
    Student.findById(admitCard.studentId).select('_id userId admissionNo rollNo').populate({ path: 'userId', select: 'name email' }).lean()
  ]);

  await ensureAdmitCardAvailabilityNotice({
    admitCard,
    exam,
    student,
    actorUserId
  });

  return AdmitCard.findById(admitCard._id)
    .populate({ path: 'studentId', select: 'admissionNo rollNo classId userId', populate: [{ path: 'userId', select: 'name email' }, { path: 'classId', select: 'name section' }] })
    .populate({ path: 'classId', select: 'name section' })
    .populate({ path: 'examId', select: 'examName academicYear startDate endDate' })
    .lean();
};

const updateAdmitCardFeeStatus = async ({ admitCardId, isFeePaid, actorUserId }) => {
  const admitCard = await AdmitCard.findById(admitCardId);
  if (!admitCard || !admitCard.isActive) {
    const error = new Error('Admit card not found');
    error.statusCode = 404;
    throw error;
  }

  admitCard.isFeePaid = Boolean(isFeePaid);
  applyEligibilityState(admitCard);
  await admitCard.save();

  const [exam, student] = await Promise.all([
    Exam.findById(admitCard.examId).lean(),
    Student.findById(admitCard.studentId).select('_id userId admissionNo rollNo').populate({ path: 'userId', select: 'name email' }).lean()
  ]);

  await ensureAdmitCardAvailabilityNotice({
    admitCard,
    exam,
    student,
    actorUserId
  });

  return AdmitCard.findById(admitCard._id)
    .populate({ path: 'studentId', select: 'admissionNo rollNo classId userId', populate: [{ path: 'userId', select: 'name email' }, { path: 'classId', select: 'name section' }] })
    .populate({ path: 'classId', select: 'name section' })
    .populate({ path: 'examId', select: 'examName academicYear startDate endDate' })
    .lean();
};

const listAdmitCardsByExam = async ({ examId }) => {
  const normalizedExamId = toId(examId);
  if (!mongoose.Types.ObjectId.isValid(normalizedExamId)) {
    const error = new Error('Invalid exam selected');
    error.statusCode = 400;
    throw error;
  }

  return AdmitCard.find({ examId: normalizedExamId, isActive: true })
    .sort({ isDownloadEnabled: -1, isStudentEligible: -1, updatedAt: -1 })
    .populate({ path: 'studentId', select: 'admissionNo rollNo classId userId', populate: [{ path: 'userId', select: 'name email' }, { path: 'classId', select: 'name section' }] })
    .populate({ path: 'classId', select: 'name section' })
    .populate({ path: 'examId', select: 'examName academicYear startDate endDate admitCardFeeAmount' })
    .lean();
};

const syncAdmitCardFeeStatusFromNoticePayment = async ({ noticeId, studentId, paymentStatus, actorUserId }) => {
  const normalizedNoticeId = toId(noticeId);
  const normalizedStudentId = toId(studentId);

  if (!normalizedNoticeId || !normalizedStudentId) {
    return null;
  }

  const notice = await Notice.findById(normalizedNoticeId).select('_id noticeType admitCardExamId').lean();
  if (!notice || notice.noticeType !== 'Payment' || !notice.admitCardExamId) {
    return null;
  }

  const admitCard = await AdmitCard.findOne({
    examId: notice.admitCardExamId,
    studentId: normalizedStudentId,
    isActive: true
  });

  if (!admitCard) {
    return null;
  }

  const normalizedStatus = String(paymentStatus || '').trim().toUpperCase();
  admitCard.isFeePaid = VERIFIED_NOTICE_PAYMENT_STATUSES.has(normalizedStatus);

  applyEligibilityState(admitCard);
  await admitCard.save();

  const [exam, student] = await Promise.all([
    Exam.findById(admitCard.examId).lean(),
    Student.findById(admitCard.studentId).select('_id userId admissionNo rollNo').populate({ path: 'userId', select: 'name email' }).lean()
  ]);

  await ensureAdmitCardAvailabilityNotice({
    admitCard,
    exam,
    student,
    actorUserId
  });

  return admitCard;
};

const getAdmitCardById = async (admitCardId) =>
  AdmitCard.findById(admitCardId)
    .populate({
      path: 'studentId',
      select: 'admissionNo rollNo classId userId',
      populate: [
        { path: 'userId', select: 'name email' },
        { path: 'classId', select: 'name section' }
      ]
    })
    .populate({ path: 'classId', select: 'name section' })
    .populate({
      path: 'examId',
      select: 'examName academicYear startDate endDate schedule',
      populate: [{ path: 'schedule.subjectId', select: 'name code' }]
    })
    .lean();

module.exports = {
  syncAdmitCardsForExam,
  listAdmitCardsByExam,
  updateAdmitCardEligibility,
  updateAdmitCardFeeStatus,
  syncAdmitCardFeeStatusFromNoticePayment,
  getAdmitCardById,
  applyEligibilityState
};
