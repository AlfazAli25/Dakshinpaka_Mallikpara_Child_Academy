const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async.middleware');
const Notice = require('../models/notice.model');
const NoticePayment = require('../models/notice-payment.model');
const Student = require('../models/student.model');
const ClassModel = require('../models/class.model');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const toId = (value) => String(value?._id || value || '');

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
  const rawPage = Number(query.page || DEFAULT_PAGE);
  const rawLimit = Number(query.limit || DEFAULT_LIMIT);

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

  const nextStatus = normalizeNoticeStatus(payload.status !== undefined ? payload.status : existingNotice?.status);
  if (!Notice.NOTICE_STATUS.includes(nextStatus)) {
    throw createHttpError(400, `Status must be one of: ${Notice.NOTICE_STATUS.join(', ')}`);
  }

  const normalizedClassIds = normalizeClassIds(payload.classIds);
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
  const filter = {
    status: 'Active',
    $or: [
      { classIds: student.classId },
      { classIds: { $size: 0 } },
      { classIds: { $exists: false } }
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

  const noticeIds = notices.map((item) => item._id);

  const payments = noticeIds.length > 0
    ? await NoticePayment.find({
      studentId: student._id,
      noticeId: { $in: noticeIds }
    })
      .select('noticeId amount paymentStatus paymentDate verificationNotes')
      .lean()
    : [];

  const paymentMap = new Map(payments.map((item) => [toId(item.noticeId), item]));

  const data = notices.map((notice) => {
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
  updateNotice,
  deleteNotice,
  expireNotice
};
