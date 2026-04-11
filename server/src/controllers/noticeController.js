const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async.middleware');
const Notice = require('../models/notice.model');
const NoticePayment = require('../models/notice-payment.model');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');
const ClassModel = require('../models/class.model');
const AdmitCard = require('../models/admit-card.model');
const Exam = require('../models/exam.model');
const { isExamCompletedForAdmitCard } = require('../utils/admit-card-exam-completion');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const toId = (value) => String(value?._id || value || '');

const parseAdmitCardIdFromActionPath = (value) => {
  const path = String(value || '').trim();
  if (!path) {
    return '';
  }

  const match = path.match(/\/admit-cards\/([a-f0-9]{24})\/download/i);
  return match ? String(match[1]).trim() : '';
};

const normalizeNoticePaymentStatus = (status) => {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'PAID') {
    return 'VERIFIED';
  }
  if (normalized === 'PENDING') {
    return 'PENDING_VERIFICATION';
  }
  if (['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'].includes(normalized)) {
    return normalized;
  }
  return '';
};

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parsePagination = (query = {}) => {
  const rawPage = Number(query.page ?? query._page ?? DEFAULT_PAGE);
  const rawLimit = Number(query.limit ?? query._limit ?? DEFAULT_LIMIT);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : DEFAULT_PAGE;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
    : DEFAULT_LIMIT;

  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
};

const normalizeNoticeType = (value) => {
  const normalized = String(value || '').trim();
  return normalized || 'General';
};

const normalizeNoticeStatus = (value) => {
  const normalized = String(value || '').trim();
  return normalized || 'Active';
};

const buildUnexpiredDueDateFilter = () => {
  const now = new Date();

  return {
    $or: [
      { dueDate: { $exists: false } },
      { dueDate: null },
      { dueDate: { $gte: now } }
    ]
  };
};

const filterOutCompletedExamAdmitCardNotices = async (items = []) => {
  const notices = Array.isArray(items) ? items : [];
  if (notices.length === 0) {
    return notices;
  }

  const admitCardDownloadNotices = notices.filter(
    (item) => String(item?.actionType || '').trim() === 'ADMIT_CARD_DOWNLOAD'
  );

  if (admitCardDownloadNotices.length === 0) {
    return notices;
  }

  const directExamIdSet = new Set(
    admitCardDownloadNotices
      .map((item) => toId(item?.admitCardExamId))
      .filter((examId) => mongoose.Types.ObjectId.isValid(examId))
  );

  const admitCardIdSet = new Set(
    admitCardDownloadNotices
      .map((item) => toId(item?.admitCardId) || parseAdmitCardIdFromActionPath(item?.actionPath))
      .filter((admitCardId) => mongoose.Types.ObjectId.isValid(admitCardId))
  );

  const admitCards = admitCardIdSet.size > 0
    ? await AdmitCard.find({ _id: { $in: Array.from(admitCardIdSet) } })
      .select('_id examId')
      .lean()
    : [];

  const admitCardExamIdMap = new Map(
    admitCards.map((item) => [toId(item?._id), toId(item?.examId)])
  );

  const admitCardLinkedExamIds = admitCards
    .map((item) => toId(item?.examId))
    .filter((examId) => mongoose.Types.ObjectId.isValid(examId));

  const admitCardExamIds = Array.from(
    new Set([...Array.from(directExamIdSet), ...admitCardLinkedExamIds])
  );

  if (admitCardExamIds.length === 0) {
    return notices;
  }

  const examRows = await Exam.find({ _id: { $in: admitCardExamIds } })
    .select('_id status endDate startDate examDate date schedule')
    .lean();

  const completedExamIdSet = new Set(
    examRows
      .filter((exam) => isExamCompletedForAdmitCard({ exam }))
      .map((exam) => toId(exam?._id))
      .filter(Boolean)
  );

  if (completedExamIdSet.size === 0) {
    return notices;
  }

  return notices.filter((notice) => {
    if (String(notice?.actionType || '').trim() !== 'ADMIT_CARD_DOWNLOAD') {
      return true;
    }

    const directExamId = toId(notice?.admitCardExamId);
    const admitCardId = toId(notice?.admitCardId) || parseAdmitCardIdFromActionPath(notice?.actionPath);
    const resolvedExamId =
      (directExamId && mongoose.Types.ObjectId.isValid(directExamId) ? directExamId : '') ||
      admitCardExamIdMap.get(admitCardId) ||
      '';

    const examId = toId(resolvedExamId);
    if (!examId) {
      return false;
    }

    return !completedExamIdSet.has(examId);
  });
};

const normalizeRecipientRole = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || 'student';
};

const normalizeOptionalDate = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || String(value).trim() === '') {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, 'Due date is invalid');
  }

  return parsed;
};

const normalizeClassIds = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw createHttpError(400, 'classIds must be an array');
  }

  const uniqueIds = Array.from(new Set(
    value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  ));

  const hasInvalidClassId = uniqueIds.some((classId) => !mongoose.Types.ObjectId.isValid(classId));
  if (hasInvalidClassId) {
    throw createHttpError(400, 'One or more class IDs are invalid');
  }

  return uniqueIds;
};

const ensureClassesExist = async (classIds = []) => {
  if (!Array.isArray(classIds) || classIds.length === 0) {
    return;
  }

  const classCount = await ClassModel.countDocuments({ _id: { $in: classIds } });
  if (classCount !== classIds.length) {
    throw createHttpError(400, 'One or more classes were not found');
  }
};

const validateNoticeInput = async ({ payload = {}, existingNotice = null } = {}) => {
  const nextTitle = payload.title !== undefined ? String(payload.title || '').trim() : String(existingNotice?.title || '').trim();
  const nextDescription = payload.description !== undefined
    ? String(payload.description || '').trim()
    : String(existingNotice?.description || '').trim();

  if (!nextTitle) {
    throw createHttpError(400, 'Title is required');
  }

  if (!nextDescription) {
    throw createHttpError(400, 'Description is required');
  }

  const nextNoticeType = normalizeNoticeType(payload.noticeType !== undefined ? payload.noticeType : existingNotice?.noticeType);
  if (!Notice.NOTICE_TYPES.includes(nextNoticeType)) {
    throw createHttpError(400, `Notice type must be one of: ${Notice.NOTICE_TYPES.join(', ')}`);
  }

  const nextRecipientRole = normalizeRecipientRole(
    payload.recipientRole !== undefined ? payload.recipientRole : existingNotice?.recipientRole
  );
  if (!Notice.RECIPIENT_ROLES.includes(nextRecipientRole)) {
    throw createHttpError(400, `Recipient role must be one of: ${Notice.RECIPIENT_ROLES.join(', ')}`);
  }

  if (nextRecipientRole !== 'student' && nextNoticeType === 'Payment') {
    throw createHttpError(400, 'Payment notices can only be issued to students');
  }

  const nextStatus = normalizeNoticeStatus(payload.status !== undefined ? payload.status : existingNotice?.status);
  if (!Notice.NOTICE_STATUS.includes(nextStatus)) {
    throw createHttpError(400, `Status must be one of: ${Notice.NOTICE_STATUS.join(', ')}`);
  }

  const normalizedClassIds = nextRecipientRole === 'all' ? [] : normalizeClassIds(payload.classIds);
  const nextClassIds = normalizedClassIds !== undefined
    ? normalizedClassIds
    : Array.isArray(existingNotice?.classIds)
      ? existingNotice.classIds.map((item) => toId(item)).filter(Boolean)
      : [];

  await ensureClassesExist(nextClassIds);

  const dueDate = normalizeOptionalDate(payload.dueDate !== undefined ? payload.dueDate : existingNotice?.dueDate);

  const rawAmount = payload.amount !== undefined ? payload.amount : existingNotice?.amount;
  const amount = rawAmount === undefined || rawAmount === null || String(rawAmount).trim() === ''
    ? undefined
    : Number(rawAmount);

  if (nextNoticeType === 'Payment') {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw createHttpError(400, 'Amount is required for payment notices');
    }
  }

  return {
    title: nextTitle,
    description: nextDescription,
    recipientRole: nextRecipientRole,
    classIds: nextClassIds,
    noticeType: nextNoticeType,
    amount: nextNoticeType === 'Payment' ? amount : undefined,
    dueDate,
    isImportant: payload.isImportant !== undefined
      ? Boolean(payload.isImportant)
      : Boolean(existingNotice?.isImportant),
    status: nextStatus
  };
};

const getAllNotices = asyncHandler(async (req, res) => {
  const pagination = parsePagination(req.query || {});
  const filter = {};

  if (req.query?.status) {
    const status = normalizeNoticeStatus(req.query.status);
    if (!Notice.NOTICE_STATUS.includes(status)) {
      throw createHttpError(400, `Status must be one of: ${Notice.NOTICE_STATUS.join(', ')}`);
    }
    filter.status = status;
  }

  if (req.query?.noticeType) {
    const noticeType = normalizeNoticeType(req.query.noticeType);
    if (!Notice.NOTICE_TYPES.includes(noticeType)) {
      throw createHttpError(400, `Notice type must be one of: ${Notice.NOTICE_TYPES.join(', ')}`);
    }
    filter.noticeType = noticeType;
  }

  if (req.query?.recipientRole) {
    const recipientRole = normalizeRecipientRole(req.query.recipientRole);
    if (!Notice.RECIPIENT_ROLES.includes(recipientRole)) {
      throw createHttpError(400, `Recipient role must be one of: ${Notice.RECIPIENT_ROLES.join(', ')}`);
    }
    filter.recipientRole = recipientRole;
  }

  if (req.query?.isImportant !== undefined) {
    const normalizedImportant = String(req.query.isImportant).trim().toLowerCase();
    if (!['true', 'false'].includes(normalizedImportant)) {
      throw createHttpError(400, 'isImportant must be true or false');
    }
    filter.isImportant = normalizedImportant === 'true';
  }

  if (req.query?.classId) {
    const classId = String(req.query.classId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(classId)) {
      throw createHttpError(400, 'Class is invalid');
    }
    filter.classIds = classId;
  }

  if (req.query?.search) {
    const search = String(req.query.search || '').trim();
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
  }

  const [total, data] = await Promise.all([
    Notice.countDocuments(filter),
    Notice.find(filter)
      .sort({ isImportant: -1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .populate({ path: 'classIds', select: 'name section' })
      .populate({ path: 'createdBy', select: 'name email role' })
      .lean()
  ]);

  res.json({
    success: true,
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit) || 0
    }
  });
});

const getStudentNotices = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id }).select('_id classId').lean();
  if (!student?.classId) {
    return res.json({
      success: true,
      data: [],
      pagination: {
        page: 1,
        limit: 0,
        total: 0,
        totalPages: 0
      }
    });
  }

  const pagination = parsePagination(req.query || {});
  const unexpiredDueDateFilter = buildUnexpiredDueDateFilter();
  const filter = {
    status: 'Active',
    $and: [
      unexpiredDueDateFilter,
      {
        $or: [
          { recipientRole: 'student' },
          { recipientRole: 'all' },
          { recipientRole: { $exists: false } }
        ]
      },
      {
        $or: [
          { studentIds: student._id },
          { studentIds: { $size: 0 } },
          { studentIds: { $exists: false } }
        ]
      },
      {
        $or: [
          { classIds: student.classId },
          { classIds: { $size: 0 } },
          { classIds: { $exists: false } }
        ]
      }
    ]
  };

  if (req.query?.noticeId) {
    const noticeId = String(req.query.noticeId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(noticeId)) {
      throw createHttpError(400, 'Notice is invalid');
    }
    filter._id = noticeId;
  }

  const [total, notices] = await Promise.all([
    Notice.countDocuments(filter),
    Notice.find(filter)
      .sort({ isImportant: -1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean()
  ]);

  const visibleNotices = await filterOutCompletedExamAdmitCardNotices(notices);
  const noticeIds = visibleNotices.map((item) => item._id);

  const payments = noticeIds.length > 0
    ? await NoticePayment.find({
      studentId: student._id,
      noticeId: { $in: noticeIds }
    })
      .select('noticeId amount paymentStatus paymentDate verificationNotes')
      .lean()
    : [];

  const paymentMap = new Map(payments.map((item) => [toId(item.noticeId), item]));

  const data = visibleNotices.map((notice) => {
    const rawPayment = paymentMap.get(toId(notice._id)) || null;
    const paymentStatus = normalizeNoticePaymentStatus(rawPayment?.paymentStatus);
    const payment = rawPayment
      ? {
        ...rawPayment,
        paymentStatus: paymentStatus || rawPayment.paymentStatus
      }
      : null;
    const isVerified = paymentStatus === 'VERIFIED';
    const isPendingVerification = paymentStatus === 'PENDING_VERIFICATION';
    const canResubmit = paymentStatus === 'REJECTED';

    return {
      ...notice,
      payment,
      hasPaid: isVerified,
      canPay: notice.noticeType === 'Payment' && notice.status === 'Active' && (!payment || canResubmit),
      isPendingVerification
    };
  });

  const adjustedTotal = Math.max(0, total - Math.max(0, notices.length - visibleNotices.length));

  res.json({
    success: true,
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: adjustedTotal,
      totalPages: Math.ceil(adjustedTotal / pagination.limit) || 0
    }
  });
});

const getTeacherNotices = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findOne({ userId: req.user._id }).select('_id classIds').lean();
  if (!teacher?._id) {
    return res.status(404).json({ success: false, message: 'Teacher record not found' });
  }

  const pagination = parsePagination(req.query || {});
  const teacherClassIds = Array.isArray(teacher.classIds)
    ? teacher.classIds.map((item) => toId(item)).filter(Boolean)
    : [];

  const classScopeOr = [
    { classIds: { $size: 0 } },
    { classIds: { $exists: false } }
  ];

  if (teacherClassIds.length > 0) {
    classScopeOr.push({ classIds: { $in: teacherClassIds } });
  }

  const filter = {
    status: 'Active',
    recipientRole: { $in: ['teacher', 'all'] },
    $and: [
      buildUnexpiredDueDateFilter()
    ],
    $or: classScopeOr
  };

  if (req.query?.noticeId) {
    const noticeId = String(req.query.noticeId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(noticeId)) {
      throw createHttpError(400, 'Notice is invalid');
    }
    filter._id = noticeId;
  }

  const [total, data] = await Promise.all([
    Notice.countDocuments(filter),
    Notice.find(filter)
      .sort({ isImportant: -1, createdAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean()
  ]);

  res.json({
    success: true,
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit) || 0
    }
  });
});

const createNotice = asyncHandler(async (req, res) => {
  const normalizedPayload = await validateNoticeInput({ payload: req.body || {} });

  const notice = await Notice.create({
    ...normalizedPayload,
    createdBy: req.user._id
  });

  const data = await Notice.findById(notice._id)
    .populate({ path: 'classIds', select: 'name section' })
    .populate({ path: 'createdBy', select: 'name email role' })
    .lean();

  res.status(201).json({
    success: true,
    message: 'Notice created successfully',
    data
  });
});

const updateNotice = asyncHandler(async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createHttpError(400, 'Notice is invalid');
  }

  const existingNotice = await Notice.findById(id).lean();
  if (!existingNotice) {
    return res.status(404).json({ success: false, message: 'Notice not found' });
  }

  const normalizedPayload = await validateNoticeInput({
    payload: req.body || {},
    existingNotice
  });

  const updated = await Notice.findByIdAndUpdate(
    id,
    normalizedPayload,
    { new: true, runValidators: true }
  )
    .populate({ path: 'classIds', select: 'name section' })
    .populate({ path: 'createdBy', select: 'name email role' })
    .lean();

  res.json({
    success: true,
    message: 'Notice updated successfully',
    data: updated
  });
});

const deleteNotice = asyncHandler(async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createHttpError(400, 'Notice is invalid');
  }

  const deleted = await Notice.findByIdAndDelete(id).lean();
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Notice not found' });
  }

  await NoticePayment.deleteMany({ noticeId: id });

  res.json({
    success: true,
    message: 'Notice deleted successfully'
  });
});

const expireNotice = asyncHandler(async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createHttpError(400, 'Notice is invalid');
  }

  const updated = await Notice.findByIdAndUpdate(
    id,
    { status: 'Expired' },
    { new: true }
  )
    .populate({ path: 'classIds', select: 'name section' })
    .populate({ path: 'createdBy', select: 'name email role' })
    .lean();

  if (!updated) {
    return res.status(404).json({ success: false, message: 'Notice not found' });
  }

  return res.json({
    success: true,
    message: 'Notice marked as expired',
    data: updated
  });
});

module.exports = {
  createNotice,
  getAllNotices,
  getStudentNotices,
  getTeacherNotices,
  updateNotice,
  deleteNotice,
  expireNotice
};
