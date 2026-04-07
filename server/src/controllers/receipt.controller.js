const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async.middleware');
const Student = require('../models/student.model');
const Payment = require('../models/payment.model');
const Receipt = require('../models/receipt.model');
const { createDynamicStudentReceiptPdf } = require('../services/receipt-pdf.service');
const { logError, logInfo } = require('../utils/logger');

const SUCCESSFUL_PAYMENT_STATUSES = new Set(['SUCCESS', 'PAID', 'VERIFIED']);

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const isSuccessfulPaymentStatus = (status) =>
  SUCCESSFUL_PAYMENT_STATUSES.has(String(status || '').trim().toUpperCase());

const sendPdfResponse = (res, generatedReceipt) => {
  const normalizedPdfBuffer = Buffer.isBuffer(generatedReceipt?.pdfBuffer)
    ? generatedReceipt.pdfBuffer
    : Buffer.from(generatedReceipt?.pdfBuffer || []);
  const fileName = String(generatedReceipt?.fileName || 'Fee_Receipt.pdf').trim() || 'Fee_Receipt.pdf';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', normalizedPdfBuffer.length);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Receipt-Generator', String(generatedReceipt?.generator || 'pdfkit-dynamic-v1'));
  res.setHeader('X-Receipt-Version', '2026-04-07-dynamic-rebuild');
  res.send(normalizedPdfBuffer);
};

const ensureStudentOwnsPayment = async ({ userId, paymentStudentId }) => {
  const requesterStudent = await Student.findOne({ userId }).select('_id').lean();
  if (!requesterStudent || String(requesterStudent._id) !== String(paymentStudentId)) {
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
    throw createHttpError('Receipt is available only for successful payments', 409);
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
    generatedReceipt = await createDynamicStudentReceiptPdf({
      payment,
      student,
      receipt,
      requestId: req.requestId
    });
  } catch (error) {
    logError('receipt_generation_failed', {
      requestId: req.requestId,
      paymentId,
      requesterId: String(req.user?._id || ''),
      message: error?.message || 'Unknown receipt generation error'
    });

    throw createHttpError('Failed to generate receipt', 500);
  }

  sendPdfResponse(res, generatedReceipt);

  logInfo('receipt_download_completed', {
    requestId: req.requestId,
    paymentId,
    requesterId: String(req.user?._id || ''),
    byteLength: generatedReceipt?.pdfBuffer?.length || 0
  });
});

module.exports = {
  downloadPaymentReceipt
};
