const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async.middleware');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');
const Payment = require('../models/payment.model');
const NoticePayment = require('../models/notice-payment.model');
const Payroll = require('../models/payroll.model');
const Receipt = require('../models/receipt.model');
const {
  createTemplateReceiptPdf,
  createTemplateTeacherSalaryReceiptPdf
} = require('../services/receipt-pdf.service');
const { logError, logInfo } = require('../utils/logger');

const SUCCESSFUL_PAYMENT_STATUSES = new Set(['SUCCESS', 'PAID', 'VERIFIED']);
const SUCCESSFUL_NOTICE_PAYMENT_STATUSES = new Set(['VERIFIED', 'PAID']);

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const isSuccessfulPaymentStatus = (status) =>
  SUCCESSFUL_PAYMENT_STATUSES.has(String(status || '').trim().toUpperCase());

const isSuccessfulNoticePaymentStatus = (status) =>
  SUCCESSFUL_NOTICE_PAYMENT_STATUSES.has(String(status || '').trim().toUpperCase());

const sendPdfResponse = (res, generatedReceipt) => {
  const normalizedPdfBuffer = Buffer.isBuffer(generatedReceipt?.pdfBuffer)
    ? generatedReceipt.pdfBuffer
    : Buffer.from(generatedReceipt?.pdfBuffer || []);
  const fileName = String(generatedReceipt?.fileName || 'Fee_Receipt.pdf').trim() || 'Fee_Receipt.pdf';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', normalizedPdfBuffer.length);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Receipt-Generator', String(generatedReceipt?.generator || 'template-html-puppeteer-v2'));
  res.setHeader('X-Receipt-Version', '2026-04-07-template-design');
  res.send(normalizedPdfBuffer);
};

const ensureStudentOwnsPayment = async ({ userId, paymentStudentId }) => {
  const requesterStudent = await Student.findOne({ userId }).select('_id').lean();
  if (!requesterStudent || String(requesterStudent._id) !== String(paymentStudentId)) {
    throw createHttpError('Forbidden', 403);
  }
};

const ensureTeacherOwnsPayroll = async ({ userId, payrollTeacherId }) => {
  const requesterTeacher = await Teacher.findOne({ userId }).select('_id').lean();
  if (!requesterTeacher || String(requesterTeacher._id) !== String(payrollTeacherId)) {
    throw createHttpError('Forbidden', 403);
  }
};

const downloadPaymentReceipt = asyncHandler(async (req, res) => {
  const paymentId = String(req.params?.paymentId || '').trim();
  if (!paymentId) {
    throw createHttpError('paymentId is required', 400);
  }

  if (!mongoose.Types.ObjectId.isValid(paymentId)) {
    throw createHttpError('Invalid paymentId', 400);
  }

  logInfo('receipt_download_requested', {
    requestId: req.requestId,
    paymentId,
    requesterId: String(req.user?._id || ''),
    requesterRole: String(req.user?.role || '')
  });

  const payment = await Payment.findById(paymentId)
    .populate('processedByAdmin', 'name email')
    .lean();

  if (!payment) {
    throw createHttpError('Payment not found', 404);
  }

  if (!isSuccessfulPaymentStatus(payment.paymentStatus)) {
    throw createHttpError('Payment not found', 404);
  }

  const student = await Student.findById(payment.studentId)
    .populate('userId', 'name email')
    .populate('classId', 'name section')
    .lean();

  if (!student) {
    throw createHttpError('Student record not found', 404);
  }

  if (req.user?.role === 'student') {
    await ensureStudentOwnsPayment({ userId: req.user._id, paymentStudentId: student._id });
  }

  const receipt = await Receipt.findOne({ paymentId: payment._id, receiptType: { $in: ['FEE', 'NOTICE'] } }).lean();

  let generatedReceipt;
  try {
    generatedReceipt = await createTemplateReceiptPdf({
      payment,
      student,
      receipt,
      requestId: req.requestId
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500);
    const message = statusCode === 500 ? (error?.message || 'Failed to generate receipt') : error?.message;

    logError('receipt_generation_failed', {
      requestId: req.requestId,
      paymentId,
      requesterId: String(req.user?._id || ''),
      statusCode,
      message: message || 'Unknown receipt generation error'
    });

    throw createHttpError(message || 'Failed to generate receipt', statusCode);
  }

  sendPdfResponse(res, generatedReceipt);

  logInfo('receipt_download_completed', {
    requestId: req.requestId,
    paymentId,
    requesterId: String(req.user?._id || ''),
    byteLength: generatedReceipt?.pdfBuffer?.length || 0
  });
});

const downloadNoticePaymentReceipt = asyncHandler(async (req, res) => {
  const noticePaymentId = String(req.params?.noticePaymentId || '').trim();
  if (!noticePaymentId) {
    throw createHttpError('noticePaymentId is required', 400);
  }

  if (!mongoose.Types.ObjectId.isValid(noticePaymentId)) {
    throw createHttpError('Invalid noticePaymentId', 400);
  }

  logInfo('notice_receipt_download_requested', {
    requestId: req.requestId,
    noticePaymentId,
    requesterId: String(req.user?._id || ''),
    requesterRole: String(req.user?.role || '')
  });

  const noticePayment = await NoticePayment.findById(noticePaymentId)
    .populate('noticeId', 'title')
    .populate('verifiedBy', 'name email')
    .lean();

  if (!noticePayment) {
    throw createHttpError('Notice payment not found', 404);
  }

  if (!isSuccessfulNoticePaymentStatus(noticePayment.paymentStatus)) {
    throw createHttpError('Notice payment not found', 404);
  }

  const student = await Student.findById(noticePayment.studentId)
    .populate('userId', 'name email')
    .populate('classId', 'name section')
    .lean();

  if (!student) {
    throw createHttpError('Student record not found', 404);
  }

  if (req.user?.role === 'student') {
    await ensureStudentOwnsPayment({ userId: req.user._id, paymentStudentId: student._id });
  }

  const receipt = await Receipt.findOne({ noticePaymentId: noticePayment._id, receiptType: 'NOTICE' }).lean();
  const mappedNoticePayment = {
    _id: noticePayment._id,
    amount: noticePayment.amount,
    paymentStatus: noticePayment.paymentStatus,
    paymentMethod: noticePayment.paymentMethod || receipt?.paymentMethod || 'NOTICE_PAYMENT',
    transactionReference: noticePayment.transactionReference,
    paymentDate: noticePayment.paymentDate,
    paidAt: noticePayment.paymentDate || noticePayment.verifiedAt || noticePayment.createdAt,
    verifiedAt: noticePayment.verifiedAt,
    createdAt: noticePayment.createdAt,
    updatedAt: noticePayment.updatedAt,
    sourceType: 'NOTICE',
    sourceLabel: noticePayment?.noticeId?.title ? `Notice: ${noticePayment.noticeId.title}` : 'Notice Payment',
    processedByAdmin: noticePayment.verifiedBy || null
  };

  let generatedReceipt;
  try {
    generatedReceipt = await createTemplateReceiptPdf({
      payment: mappedNoticePayment,
      student,
      receipt,
      requestId: req.requestId
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500);
    const message = statusCode === 500 ? (error?.message || 'Failed to generate notice receipt') : error?.message;

    logError('notice_receipt_generation_failed', {
      requestId: req.requestId,
      noticePaymentId,
      requesterId: String(req.user?._id || ''),
      statusCode,
      message: message || 'Unknown notice receipt generation error'
    });

    throw createHttpError(message || 'Failed to generate notice receipt', statusCode);
  }

  sendPdfResponse(res, generatedReceipt);

  logInfo('notice_receipt_download_completed', {
    requestId: req.requestId,
    noticePaymentId,
    requesterId: String(req.user?._id || ''),
    byteLength: generatedReceipt?.pdfBuffer?.length || 0
  });
});

const downloadTeacherSalaryReceipt = asyncHandler(async (req, res) => {
  const payrollId = String(req.params?.payrollId || req.params?.paymentId || '').trim();
  if (!payrollId) {
    throw createHttpError('payrollId is required', 400);
  }

  if (!mongoose.Types.ObjectId.isValid(payrollId)) {
    throw createHttpError('Invalid payrollId', 400);
  }

  logInfo('teacher_receipt_download_requested', {
    requestId: req.requestId,
    payrollId,
    requesterId: String(req.user?._id || ''),
    requesterRole: String(req.user?.role || '')
  });

  const payroll = await Payroll.findById(payrollId)
    .populate('processedByAdmin', 'name email')
    .lean();

  if (!payroll) {
    throw createHttpError('Payroll payment not found', 404);
  }

  const normalizedPayrollStatus = String(payroll?.status || '').trim().toUpperCase();
  if (normalizedPayrollStatus !== 'PAID') {
    throw createHttpError('Payroll payment not found', 404);
  }

  const teacher = await Teacher.findById(payroll.teacherId)
    .populate('userId', 'name email')
    .lean();

  if (!teacher) {
    throw createHttpError('Teacher record not found', 404);
  }

  if (req.user?.role === 'teacher') {
    await ensureTeacherOwnsPayroll({ userId: req.user._id, payrollTeacherId: teacher._id });
  }

  const receipt = await Receipt.findOne({ payrollId: payroll._id, receiptType: 'SALARY' }).lean();

  let generatedReceipt;
  try {
    generatedReceipt = await createTemplateTeacherSalaryReceiptPdf({
      payroll,
      teacher,
      receipt,
      requestId: req.requestId
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500);
    const message = statusCode === 500 ? (error?.message || 'Failed to generate receipt') : error?.message;

    logError('teacher_receipt_generation_failed', {
      requestId: req.requestId,
      payrollId,
      requesterId: String(req.user?._id || ''),
      statusCode,
      message: message || 'Unknown receipt generation error'
    });

    throw createHttpError(message || 'Failed to generate receipt', statusCode);
  }

  sendPdfResponse(res, generatedReceipt);

  logInfo('teacher_receipt_download_completed', {
    requestId: req.requestId,
    payrollId,
    requesterId: String(req.user?._id || ''),
    byteLength: generatedReceipt?.pdfBuffer?.length || 0
  });
});

module.exports = {
  downloadPaymentReceipt,
  downloadNoticePaymentReceipt,
  downloadTeacherSalaryReceipt
};
