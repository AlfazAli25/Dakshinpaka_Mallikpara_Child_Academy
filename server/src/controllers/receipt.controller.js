const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async.middleware');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');
const Class = require('../models/class.model');
const Payment = require('../models/payment.model');
const Payroll = require('../models/payroll.model');
const Receipt = require('../models/receipt.model');
const receiptService = require('../services/receipt.service');
const {
  createStudentFeeReceiptPdf,
  createStudentFeeReceiptFallbackPdf,
  createTeacherSalaryReceiptPdf,
  createTeacherSalaryReceiptFallbackPdf
} = require('../services/receipt-pdf.service');

const isAdminUser = (req) => req.user?.role === 'admin';

const sendPdfResponse = (res, generatedReceipt) => {
  const normalizedPdfBuffer = Buffer.isBuffer(generatedReceipt?.pdfBuffer)
    ? generatedReceipt.pdfBuffer
    : Buffer.from(generatedReceipt?.pdfBuffer || []);

  const fileName = String(generatedReceipt?.fileName || 'Receipt.pdf');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', normalizedPdfBuffer.length);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Receipt-Generator', String(generatedReceipt?.generator || 'unknown'));
  res.setHeader('X-Receipt-Version', '2026-04-07-production-safe');
  res.send(normalizedPdfBuffer);
};

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
  try {
    const paymentId = String(req.params?.paymentId || '').trim();
    console.log('[receipt.controller] Student receipt download request:', {
      paymentId,
      requesterId: String(req.user?._id || ''),
      role: String(req.user?.role || '')
    });

    if (!paymentId) {
      return res.status(400).json({ success: false, message: 'paymentId is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(paymentId)) {
      return res.status(400).json({ success: false, message: 'Invalid paymentId' });
    }

    console.log('[receipt.controller] Fetching payment record');
    const payment = await Payment.findById(paymentId).lean();
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    console.log('[receipt.controller] Fetching related student data');
    const [student, receipt] = await Promise.all([
      Student.findById(payment.studentId)
        .populate('userId', 'name')
        .populate('classId', 'name section')
        .lean(),
      Receipt.findOne({ paymentId: payment._id, receiptType: 'FEE' }).lean()
    ]);

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student record not found' });
    }

    if (!isAdminUser(req)) {
      if (req.user?.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const requesterStudent = await Student.findOne({ userId: req.user._id }).select('_id').lean();
      if (!requesterStudent || String(requesterStudent._id) !== String(student._id)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }

    let classRecord = null;
    if (student?.classId && typeof student.classId === 'object') {
      classRecord = student.classId;
    } else if (student?.classId && mongoose.Types.ObjectId.isValid(String(student.classId))) {
      classRecord = await Class.findById(student.classId).select('name section').lean();
    }

    console.log('[receipt.controller] Generating HTML');
    console.log('[receipt.controller] Launching browser');
    let generatedReceipt;
    try {
      generatedReceipt = await createStudentFeeReceiptPdf({
        payment,
        student,
        classRecord,
        receipt
      });
    } catch (error) {
      console.error('[receipt.controller] Primary student receipt generation failed, using fallback:', error?.message || error);
      generatedReceipt = await createStudentFeeReceiptFallbackPdf({
        payment,
        student,
        classRecord,
        receipt
      });
    }

    console.log('[receipt.controller] Generating PDF');
    console.log('[receipt.controller] Sending response');
    return sendPdfResponse(res, generatedReceipt);
  } catch (error) {
    console.error('Receipt generation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate receipt',
      error: error.message
    });
  }
});

const downloadTeacherSalaryReceipt = asyncHandler(async (req, res) => {
  try {
    const paymentId = String(req.params?.paymentId || '').trim();
    console.log('[receipt.controller] Teacher receipt download request:', {
      paymentId,
      requesterId: String(req.user?._id || ''),
      role: String(req.user?.role || '')
    });

    if (!paymentId) {
      return res.status(400).json({ success: false, message: 'paymentId is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(paymentId)) {
      return res.status(400).json({ success: false, message: 'Invalid paymentId' });
    }

    console.log('[receipt.controller] Fetching payment record');
    let payroll = await Payroll.findById(paymentId).lean();
    let receipt = null;

    if (payroll) {
      receipt = await Receipt.findOne({ payrollId: payroll._id, receiptType: 'SALARY' }).lean();
    } else {
      receipt = await Receipt.findOne({ _id: paymentId, receiptType: 'SALARY' }).lean();
      if (receipt?.payrollId) {
        payroll = await Payroll.findById(receipt.payrollId).lean();
      }
    }

    if (!payroll && !receipt) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const teacherId = payroll?.teacherId || receipt?.teacherId;
    if (!teacherId) {
      return res.status(404).json({ success: false, message: 'Teacher record not found' });
    }

    console.log('[receipt.controller] Fetching related teacher data');
    const teacher = await Teacher.findById(teacherId).populate('userId', 'name').lean();
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher record not found' });
    }

    if (!isAdminUser(req)) {
      if (req.user?.role !== 'teacher') {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const requesterTeacher = await Teacher.findOne({ userId: req.user._id }).select('_id').lean();
      if (!requesterTeacher || String(requesterTeacher._id) !== String(teacher._id)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }

    if (!receipt && payroll) {
      receipt = await Receipt.findOne({ payrollId: payroll._id, receiptType: 'SALARY' }).lean();
    }

    console.log('[receipt.controller] Generating HTML');
    console.log('[receipt.controller] Launching browser');
    let generatedReceipt;
    try {
      generatedReceipt = await createTeacherSalaryReceiptPdf({
        payroll,
        teacher,
        receipt
      });
    } catch (error) {
      console.error('[receipt.controller] Primary teacher receipt generation failed, using fallback:', error?.message || error);
      generatedReceipt = await createTeacherSalaryReceiptFallbackPdf({
        payroll,
        teacher,
        receipt
      });
    }

    console.log('[receipt.controller] Generating PDF');
    console.log('[receipt.controller] Sending response');
    return sendPdfResponse(res, generatedReceipt);
  } catch (error) {
    console.error('Receipt generation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate receipt',
      error: error.message
    });
  }
});

module.exports = {
  listStudentReceipts,
  listTeacherReceipts,
  downloadStudentFeeReceipt,
  downloadTeacherSalaryReceipt
};
