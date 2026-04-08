const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async.middleware');
const Notice = require('../models/notice.model');
const NoticePayment = require('../models/notice-payment.model');
const Student = require('../models/student.model');
const { uploadPaymentScreenshot } = require('../services/cloudinary.service');
const { createNoticeReceipt } = require('../services/receipt.service');
const { syncAdmitCardFeeStatusFromNoticePayment } = require('../services/admit-card.service');

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const toId = (value) => String(value?._id || value || '');

const normalizePaymentStatus = (status) => {
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

const buildPaymentStatusFilter = (status) => {
  const normalized = normalizePaymentStatus(status);
  if (!normalized) {
    return null;
  }

  if (normalized === 'PENDING_VERIFICATION') {
    return { $in: ['PENDING_VERIFICATION', 'Pending'] };
  }

  if (normalized === 'VERIFIED') {
    return { $in: ['VERIFIED', 'Paid'] };
  }

  return normalized;
};

const mapPaymentForResponse = (payment) => {
  if (!payment) {
    return null;
  }

  const normalizedStatus = normalizePaymentStatus(payment.paymentStatus);
  return {
    ...payment,
    paymentStatus: normalizedStatus || payment.paymentStatus
  };
};

const mapReceiptForResponse = (receipt) => {
  if (!receipt) {
    return null;
  }

  return {
    _id: receipt._id,
    receiptNumber: receipt.receiptNumber,
    receiptType: receipt.receiptType,
    amount: receipt.amount,
    paymentMethod: receipt.paymentMethod,
    paymentDate: receipt.paymentDate,
    transactionReference: receipt.transactionReference,
    noticeTitle: receipt.noticeTitle
  };
};

const payNotice = asyncHandler(async (req, res) => {
  const noticeId = String(req.body?.noticeId || '').trim();
  const payloadStudentId = String(req.body?.studentId || '').trim();
  const amount = Number(req.body?.amount);
  const screenshot = req.file;
  const transactionReference = String(req.body?.transactionReference || '').trim();

  if (!mongoose.Types.ObjectId.isValid(noticeId)) {
    throw createHttpError(400, 'Notice is invalid');
  }

  if (payloadStudentId && !mongoose.Types.ObjectId.isValid(payloadStudentId)) {
    throw createHttpError(400, 'Student is invalid');
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw createHttpError(400, 'Amount must be greater than 0');
  }

  if (!screenshot) {
    throw createHttpError(400, 'Payment screenshot is required');
  }

  const student = await Student.findOne({ userId: req.user._id }).select('_id classId').lean();
  if (!student?._id) {
    throw createHttpError(404, 'Student not found');
  }

  if (payloadStudentId && payloadStudentId !== toId(student._id)) {
    throw createHttpError(403, 'You can only pay notices for your own student account');
  }

  const notice = await Notice.findById(noticeId).select('_id recipientRole noticeType amount status classIds dueDate').lean();
  if (!notice) {
    throw createHttpError(404, 'Notice not found');
  }

  if (notice.status !== 'Active') {
    throw createHttpError(400, 'Notice is not active');
  }

  if (notice.noticeType !== 'Payment') {
    throw createHttpError(400, 'This notice does not require payment');
  }

  if (String(notice.recipientRole || 'student') !== 'student') {
    throw createHttpError(400, 'Teacher notices cannot be paid from student accounts');
  }

  const targetClassIds = Array.isArray(notice.classIds)
    ? notice.classIds.map((item) => toId(item)).filter(Boolean)
    : [];

  const studentClassId = toId(student.classId);
  if (targetClassIds.length > 0 && !targetClassIds.includes(studentClassId)) {
    throw createHttpError(403, 'This notice is not assigned to your class');
  }

  const requiredAmount = Number(notice.amount || 0);
  if (!Number.isFinite(requiredAmount) || requiredAmount <= 0) {
    throw createHttpError(400, 'Payment amount is not configured for this notice');
  }

  if (Math.abs(amount - requiredAmount) > 0.0001) {
    throw createHttpError(400, `Amount must be exactly ${requiredAmount}`);
  }

  const existingPayment = await NoticePayment.findOne({
    studentId: student._id,
    noticeId: notice._id
  });

  const existingStatus = normalizePaymentStatus(existingPayment?.paymentStatus);
  if (existingPayment && existingStatus === 'VERIFIED') {
    throw createHttpError(409, 'Payment already verified for this notice');
  }

  if (existingPayment && existingStatus === 'PENDING_VERIFICATION') {
    throw createHttpError(409, 'Payment screenshot is already pending verification for this notice');
  }

  if (existingPayment && existingStatus !== 'REJECTED') {
    throw createHttpError(409, 'Payment already submitted for this notice');
  }

  let uploadedScreenshot;
  try {
    uploadedScreenshot = await uploadPaymentScreenshot({
      buffer: screenshot.buffer,
      mimeType: screenshot.mimetype,
      originalName: screenshot.originalname
    });
  } catch (error) {
    if (!error.statusCode || error.statusCode >= 500) {
      error.statusCode = 502;
      error.message = 'Failed to upload screenshot to storage provider';
    }

    throw error;
  }

  try {
    const paymentPayload = {
      amount,
      paymentStatus: 'PENDING_VERIFICATION',
      paymentDate: new Date(),
      screenshotPath: uploadedScreenshot.secureUrl,
      screenshotPublicId: uploadedScreenshot.publicId,
      transactionReference: transactionReference || undefined,
      verifiedBy: undefined,
      verifiedAt: undefined,
      verificationNotes: undefined
    };

    let paymentDoc = existingPayment;
    if (existingPayment && existingStatus === 'REJECTED') {
      paymentDoc.set(paymentPayload);
      await paymentDoc.save();
    } else {
      paymentDoc = await NoticePayment.create({
        studentId: student._id,
        noticeId: notice._id,
        ...paymentPayload
      });
    }

    const data = await NoticePayment.findById(paymentDoc._id)
      .populate({ path: 'noticeId', select: 'title noticeType amount dueDate' })
      .populate({ path: 'studentId', select: 'admissionNo' })
      .lean();

    return res.status(201).json({
      success: true,
      message: 'Payment screenshot uploaded. Waiting for admin verification.',
      data: mapPaymentForResponse(data)
    });
  } catch (error) {
    if (Number(error?.code || 0) === 11000) {
      throw createHttpError(409, 'Payment screenshot is already pending verification for this notice');
    }

    throw error;
  }
});

const recordCashNoticePayment = asyncHandler(async (req, res) => {
  const noticeId = String(req.body?.noticeId || '').trim();
  const studentId = String(req.body?.studentId || '').trim();
  const requestedAmount = req.body?.amount;
  const transactionReference = String(req.body?.transactionReference || '').trim();
  const notes = String(req.body?.notes || '').trim();

  if (!mongoose.Types.ObjectId.isValid(noticeId)) {
    throw createHttpError(400, 'Notice is invalid');
  }

  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw createHttpError(400, 'Student is invalid');
  }

  const student = await Student.findById(studentId).select('_id classId').lean();
  if (!student?._id) {
    throw createHttpError(404, 'Student not found');
  }

  const notice = await Notice.findById(noticeId).select('_id recipientRole noticeType amount status classIds dueDate').lean();
  if (!notice) {
    throw createHttpError(404, 'Notice not found');
  }

  if (notice.status !== 'Active') {
    throw createHttpError(400, 'Notice is not active');
  }

  if (notice.noticeType !== 'Payment') {
    throw createHttpError(400, 'This notice does not require payment');
  }

  if (String(notice.recipientRole || 'student') !== 'student') {
    throw createHttpError(400, 'Teacher notices cannot be paid from student accounts');
  }

  const targetClassIds = Array.isArray(notice.classIds)
    ? notice.classIds.map((item) => toId(item)).filter(Boolean)
    : [];

  const studentClassId = toId(student.classId);
  if (targetClassIds.length > 0 && !targetClassIds.includes(studentClassId)) {
    throw createHttpError(400, 'Selected student is not assigned to this notice');
  }

  const requiredAmount = Number(notice.amount || 0);
  if (!Number.isFinite(requiredAmount) || requiredAmount <= 0) {
    throw createHttpError(400, 'Payment amount is not configured for this notice');
  }

  let amount = requiredAmount;
  if (requestedAmount !== undefined && requestedAmount !== null && String(requestedAmount).trim() !== '') {
    amount = Number(requestedAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw createHttpError(400, 'Amount must be greater than 0');
    }
  }

  if (Math.abs(amount - requiredAmount) > 0.0001) {
    throw createHttpError(400, `Amount must be exactly ${requiredAmount}`);
  }

  const existingPayment = await NoticePayment.findOne({
    studentId: student._id,
    noticeId: notice._id
  });

  const existingStatus = normalizePaymentStatus(existingPayment?.paymentStatus);
  if (existingPayment && existingStatus === 'VERIFIED') {
    throw createHttpError(409, 'Payment already verified for this notice');
  }

  if (existingPayment && existingStatus === 'PENDING_VERIFICATION') {
    throw createHttpError(409, 'A screenshot submission is already pending. Verify or reject it before recording cash payment.');
  }

  const paidAt = new Date();
  const verificationNotePrefix = 'Paid via cash at admin desk';
  const verificationNotes = notes ? `${verificationNotePrefix}. ${notes}` : verificationNotePrefix;

  let paymentDoc = existingPayment;
  if (existingPayment) {
    paymentDoc.set({
      amount,
      paymentStatus: 'VERIFIED',
      paymentDate: paidAt,
      screenshotPath: undefined,
      screenshotPublicId: undefined,
      transactionReference: transactionReference || undefined,
      verifiedBy: req.user._id,
      verifiedAt: paidAt,
      verificationNotes
    });
    await paymentDoc.save();
  } else {
    paymentDoc = await NoticePayment.create({
      studentId: student._id,
      noticeId: notice._id,
      amount,
      paymentStatus: 'VERIFIED',
      paymentDate: paidAt,
      transactionReference: transactionReference || undefined,
      verifiedBy: req.user._id,
      verifiedAt: paidAt,
      verificationNotes
    });
  }

  const data = await NoticePayment.findById(paymentDoc._id)
    .populate({ path: 'noticeId', select: 'title noticeType amount dueDate' })
    .populate({
      path: 'studentId',
      select: 'admissionNo userId classId',
      populate: [
        { path: 'userId', select: 'name email' },
        { path: 'classId', select: 'name section' }
      ]
    })
    .lean();

  const receipt = await createNoticeReceipt({
    student: data?.studentId,
    notice: data?.noticeId,
    noticePayment: data,
    amount: Number(data?.amount || 0),
    paymentMethod: 'CASH',
    transactionReference: data?.transactionReference,
    generatedBy: req.user._id
  });

  await syncAdmitCardFeeStatusFromNoticePayment({
    noticeId: paymentDoc.noticeId,
    studentId: paymentDoc.studentId,
    paymentStatus: paymentDoc.paymentStatus,
    actorUserId: req.user?._id
  });

  res.status(201).json({
    success: true,
    message: 'Cash notice payment recorded successfully',
    data: {
      ...mapPaymentForResponse(data),
      receipt: mapReceiptForResponse(receipt)
    }
  });
});

const listPendingNoticePayments = asyncHandler(async (_req, res) => {
  const pendingItems = await NoticePayment.find({
    paymentStatus: { $in: ['PENDING_VERIFICATION', 'Pending'] }
  })
    .sort({ paymentDate: -1, createdAt: -1 })
    .populate({ path: 'noticeId', select: 'title amount dueDate' })
    .populate({
      path: 'studentId',
      select: 'admissionNo userId classId',
      populate: [
        { path: 'userId', select: 'name email' },
        { path: 'classId', select: 'name section' }
      ]
    })
    .lean();

  res.json({
    success: true,
    data: pendingItems.map(mapPaymentForResponse)
  });
});

const listNoticePaymentHistory = asyncHandler(async (req, res) => {
  const noticeId = String(req.query?.noticeId || '').trim();
  const paymentStatus = String(req.query?.paymentStatus || '').trim();
  const pageRaw = Number(req.query?.page || 1);
  const limitRaw = Number(req.query?.limit || 50);

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50;
  const skip = (page - 1) * limit;

  const filter = {};

  if (noticeId) {
    if (!mongoose.Types.ObjectId.isValid(noticeId)) {
      throw createHttpError(400, 'Notice is invalid');
    }

    filter.noticeId = noticeId;
  }

  if (paymentStatus) {
    const statusFilter = buildPaymentStatusFilter(paymentStatus);
    if (!statusFilter) {
      throw createHttpError(400, 'Payment status must be one of: PENDING_VERIFICATION, VERIFIED, REJECTED');
    }

    filter.paymentStatus = statusFilter;
  }

  const [historyItems, total] = await Promise.all([
    NoticePayment.find(filter)
      .sort({ updatedAt: -1, paymentDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'noticeId', select: 'title amount dueDate' })
      .populate({
        path: 'studentId',
        select: 'admissionNo userId classId',
        populate: [
          { path: 'userId', select: 'name email' },
          { path: 'classId', select: 'name section' }
        ]
      })
      .populate({ path: 'verifiedBy', select: 'name email role' })
      .lean(),
    NoticePayment.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: historyItems.map(mapPaymentForResponse),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1)
    }
  });
});

const listNoticePaymentsByNotice = asyncHandler(async (req, res) => {
  const noticeId = String(req.query?.noticeId || '').trim();

  if (!mongoose.Types.ObjectId.isValid(noticeId)) {
    throw createHttpError(400, 'Notice is invalid');
  }

  const paymentItems = await NoticePayment.find({ noticeId })
    .select('studentId paymentStatus paymentDate verifiedAt createdAt')
    .lean();

  res.json({
    success: true,
    data: paymentItems.map(mapPaymentForResponse)
  });
});

const verifyNoticePayment = asyncHandler(async (req, res) => {
  const paymentId = String(req.params?.paymentId || '').trim();
  const decision = String(req.body?.decision || '').trim().toUpperCase();
  const notes = String(req.body?.notes || '').trim();

  if (!mongoose.Types.ObjectId.isValid(paymentId)) {
    throw createHttpError(400, 'Notice payment is invalid');
  }

  if (!['APPROVE', 'REJECT'].includes(decision)) {
    throw createHttpError(400, 'Decision must be APPROVE or REJECT');
  }

  const payment = await NoticePayment.findById(paymentId);
  if (!payment) {
    throw createHttpError(404, 'Notice payment not found');
  }

  const currentStatus = normalizePaymentStatus(payment.paymentStatus);
  if (currentStatus === 'VERIFIED') {
    throw createHttpError(409, 'This notice payment is already verified');
  }

  if (currentStatus !== 'PENDING_VERIFICATION') {
    throw createHttpError(400, 'Only pending notice payments can be verified or rejected');
  }

  payment.paymentStatus = decision === 'APPROVE' ? 'VERIFIED' : 'REJECTED';
  payment.verifiedBy = req.user._id;
  payment.verifiedAt = new Date();
  payment.verificationNotes = notes || undefined;
  await payment.save();

  await syncAdmitCardFeeStatusFromNoticePayment({
    noticeId: payment.noticeId,
    studentId: payment.studentId,
    paymentStatus: payment.paymentStatus,
    actorUserId: req.user?._id
  });

  const data = await NoticePayment.findById(payment._id)
    .populate({ path: 'noticeId', select: 'title noticeType amount dueDate' })
    .populate({
      path: 'studentId',
      select: 'admissionNo userId classId',
      populate: [
        { path: 'userId', select: 'name email' },
        { path: 'classId', select: 'name section' }
      ]
    })
    .lean();

  let receipt = null;
  if (decision === 'APPROVE') {
    receipt = await createNoticeReceipt({
      student: data?.studentId,
      notice: data?.noticeId,
      noticePayment: data,
      amount: Number(data?.amount || 0),
      paymentMethod: 'STATIC_QR',
      transactionReference: data?.transactionReference,
      generatedBy: req.user._id
    });
  }

  res.json({
    success: true,
    message: decision === 'APPROVE' ? 'Notice payment verified successfully' : 'Notice payment rejected',
    data: {
      ...mapPaymentForResponse(data),
      receipt: mapReceiptForResponse(receipt)
    }
  });
});

module.exports = {
  payNotice,
  recordCashNoticePayment,
  listPendingNoticePayments,
  listNoticePaymentHistory,
  listNoticePaymentsByNotice,
  verifyNoticePayment
};
