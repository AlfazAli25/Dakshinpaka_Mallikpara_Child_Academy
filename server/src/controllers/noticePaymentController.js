const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async.middleware');
const Notice = require('../models/notice.model');
const NoticePayment = require('../models/notice-payment.model');
const Student = require('../models/student.model');

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const toId = (value) => String(value?._id || value || '');

const payNotice = asyncHandler(async (req, res) => {
  const noticeId = String(req.body?.noticeId || '').trim();
  const payloadStudentId = String(req.body?.studentId || '').trim();
  const amount = Number(req.body?.amount);

  if (!mongoose.Types.ObjectId.isValid(noticeId)) {
    throw createHttpError(400, 'Notice is invalid');
  }

  if (payloadStudentId && !mongoose.Types.ObjectId.isValid(payloadStudentId)) {
    throw createHttpError(400, 'Student is invalid');
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw createHttpError(400, 'Amount must be greater than 0');
  }

  const student = await Student.findOne({ userId: req.user._id }).select('_id classId').lean();
  if (!student?._id) {
    throw createHttpError(404, 'Student not found');
  }

  if (payloadStudentId && payloadStudentId !== toId(student._id)) {
    throw createHttpError(403, 'You can only pay notices for your own student account');
  }

  const notice = await Notice.findById(noticeId).select('_id noticeType amount status classIds dueDate').lean();
  if (!notice) {
    throw createHttpError(404, 'Notice not found');
  }

  if (notice.status !== 'Active') {
    throw createHttpError(400, 'Notice is not active');
  }

  if (notice.noticeType !== 'Payment') {
    throw createHttpError(400, 'This notice does not require payment');
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
  })
    .select('_id')
    .lean();

  if (existingPayment) {
    throw createHttpError(409, 'Payment already made for this notice');
  }

  try {
    const created = await NoticePayment.create({
      studentId: student._id,
      noticeId: notice._id,
      amount,
      paymentStatus: 'Paid',
      paymentDate: new Date()
    });

    const data = await NoticePayment.findById(created._id)
      .populate({ path: 'noticeId', select: 'title noticeType amount dueDate' })
      .populate({ path: 'studentId', select: 'admissionNo' })
      .lean();

    return res.status(201).json({
      success: true,
      message: 'Payment successful',
      data
    });
  } catch (error) {
    if (Number(error?.code || 0) === 11000) {
      throw createHttpError(409, 'Payment already made for this notice');
    }

    throw error;
  }
});

module.exports = {
  payNotice
};
