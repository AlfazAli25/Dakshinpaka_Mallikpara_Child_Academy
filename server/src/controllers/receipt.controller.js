const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async.middleware');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');
const Class = require('../models/class.model');
const Payment = require('../models/payment.model');
const Receipt = require('../models/receipt.model');
const receiptService = require('../services/receipt.service');
const {
  createStudentFeeReceiptPdf,
  createStudentFeeReceiptFallbackPdf
} = require('../services/receipt-pdf.service');

const listStudentReceipts = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student record not found' });
  }

  const receipts = await receiptService.findStudentReceipts(student._id);
  res.json({ success: true, data: receipts });
});

const listTeacherReceipts = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findOne({ userId: req.user._id });
  if (!teacher) {
    return res.status(404).json({ success: false, message: 'Teacher record not found' });
  }

  const receipts = await receiptService.findTeacherReceipts(teacher._id);
  res.json({ success: true, data: receipts });
});

const downloadStudentFeeReceipt = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(paymentId)) {
    return res.status(400).json({ success: false, message: 'Invalid paymentId' });
  }

  const student = await Student.findOne({ userId: req.user._id }).populate('userId', 'name');
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student record not found' });
  }

  const payment = await Payment.findById(paymentId).lean();
  if (!payment || String(payment.studentId) !== String(student._id)) {
    return res.status(404).json({ success: false, message: 'Payment not found' });
  }

  const [classRecord, receipt] = await Promise.all([
    student.classId ? Class.findById(student.classId).select('name section').lean() : null,
    Receipt.findOne({ paymentId: payment._id, receiptType: 'FEE' }).lean()
  ]);

  let generatedReceipt;
  try {
    generatedReceipt = await createStudentFeeReceiptPdf({
      payment,
      student,
      classRecord,
      receipt
    });
  } catch (error) {
    console.error('[receipt.controller] Primary receipt generation failed, using fallback:', error?.message || error);
    generatedReceipt = await createStudentFeeReceiptFallbackPdf({
      payment,
      student,
      classRecord,
      receipt
    });
  }

  const { pdfBuffer, fileName } = generatedReceipt;

  const normalizedPdfBuffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer || []);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', normalizedPdfBuffer.length);
  res.setHeader('Cache-Control', 'no-store');
  res.send(normalizedPdfBuffer);
});

module.exports = { listStudentReceipts, listTeacherReceipts, downloadStudentFeeReceipt };
