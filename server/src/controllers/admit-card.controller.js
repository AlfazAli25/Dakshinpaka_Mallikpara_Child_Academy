const mongoose = require('mongoose');
const AdmZip = require('adm-zip');
const asyncHandler = require('../middleware/async.middleware');
const Student = require('../models/student.model');
const AdmitCard = require('../models/admit-card.model');
const {
  syncAdmitCardsForExam,
  listAdmitCardsByExam,
  updateAdmitCardFeeStatus,
  getAdmitCardById
} = require('../services/admit-card.service');
const { createAdmitCardPdf } = require('../services/admit-card-pdf.service');

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const toId = (value) => String(value?._id || value || '').trim();

const toValidDate = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const isExamCompletedForAdmitCard = (exam = {}) => {
  const normalizedStatus = String(exam?.status || '').trim().toLowerCase();
  if (normalizedStatus === 'completed') {
    return true;
  }

  const endDate = toValidDate(exam?.endDate || exam?.startDate || exam?.examDate || exam?.date);
  if (!endDate) {
    return false;
  }

  return endDate.getTime() <= Date.now();
};

const toSafeFileToken = (value, fallback = 'File') => {
  const normalized = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '_');

  return normalized || fallback;
};

const toBooleanInput = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return null;
};

const listMyAvailableAdmitCardsHandler = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user?._id }).select('_id').lean();
  if (!student?._id) {
    return res.json({ success: true, data: [] });
  }

  const data = await AdmitCard.find({
    studentId: student._id,
    isActive: true,
    isFeePaid: true
  })
    .sort({ availableAt: -1, updatedAt: -1 })
    .populate({ path: 'classId', select: 'name section' })
    .populate({ path: 'examId', select: 'examName academicYear startDate endDate examDate date status' })
    .lean();

  const availableCards = data.filter((item) => !isExamCompletedForAdmitCard(item?.examId));

  return res.json({ success: true, data: availableCards });
});

const listExamAdmitCardsHandler = asyncHandler(async (req, res) => {
  const examId = String(req.params?.examId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(examId)) {
    throw createHttpError(400, 'Invalid exam selected');
  }

  const cards = await listAdmitCardsByExam({ examId });
  res.json({
    success: true,
    data: cards
  });
});

const syncExamAdmitCardsHandler = asyncHandler(async (req, res) => {
  const examId = String(req.params?.examId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(examId)) {
    throw createHttpError(400, 'Invalid exam selected');
  }

  const result = await syncAdmitCardsForExam({
    examId,
    actorUserId: req.user?._id
  });

  res.json({
    success: true,
    message: 'Admit cards synchronized successfully',
    data: result
  });
});

const setAdmitCardFeeStatusHandler = asyncHandler(async (req, res) => {
  const admitCardId = String(req.params?.admitCardId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(admitCardId)) {
    throw createHttpError(400, 'Invalid admit card selected');
  }

  const isFeePaid = toBooleanInput(req.body?.isFeePaid);
  if (isFeePaid === null) {
    throw createHttpError(400, 'isFeePaid must be true or false');
  }

  const data = await updateAdmitCardFeeStatus({
    admitCardId,
    isFeePaid,
    actorUserId: req.user?._id
  });

  res.json({
    success: true,
    message: 'Admit card fee status updated successfully',
    data
  });
});

const downloadClassAdmitCardsZipHandler = asyncHandler(async (req, res) => {
  const examId = String(req.params?.examId || '').trim();
  const classId = String(req.params?.classId || '').trim();

  if (!mongoose.Types.ObjectId.isValid(examId)) {
    throw createHttpError(400, 'Invalid exam selected');
  }

  if (!mongoose.Types.ObjectId.isValid(classId)) {
    throw createHttpError(400, 'Invalid class selected');
  }

  const allExamCards = await listAdmitCardsByExam({ examId });
  const classCards = allExamCards.filter((card) => toId(card?.classId) === classId);

  if (classCards.length === 0) {
    throw createHttpError(404, 'No admit cards found for this class');
  }

  const zip = new AdmZip();

  for (const admitCard of classCards) {
    const generated = await createAdmitCardPdf({
      admitCard,
      exam: admitCard.examId,
      student: admitCard.studentId
    });

    const pdfBuffer = Buffer.isBuffer(generated.pdfBuffer)
      ? generated.pdfBuffer
      : Buffer.from(generated.pdfBuffer);

    zip.addFile(generated.fileName, pdfBuffer);
  }

  const firstCard = classCards[0] || {};
  const className = String(firstCard?.classId?.name || 'Class').trim();
  const classSection = String(firstCard?.classId?.section || '').trim();
  const classLabel = classSection ? `${className}_${classSection}` : className;
  const examName = String(firstCard?.examId?.examName || firstCard?.examName || 'Exam').trim();

  const zipFileName =
    `Admit_Cards_${toSafeFileToken(classLabel, 'Class')}_${toSafeFileToken(examName, 'Exam')}.zip`;

  const zipBuffer = zip.toBuffer();

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
  res.setHeader('Content-Length', zipBuffer.length);
  res.setHeader('Cache-Control', 'no-store');
  res.send(zipBuffer);
});

const downloadAdmitCardHandler = asyncHandler(async (req, res) => {
  const admitCardId = String(req.params?.admitCardId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(admitCardId)) {
    throw createHttpError(400, 'Invalid admit card selected');
  }

  const admitCard = await getAdmitCardById(admitCardId);
  if (!admitCard || !admitCard.isActive) {
    throw createHttpError(404, 'Admit card not found');
  }

  if (req.user?.role === 'student') {
    const requesterStudent = await Student.findOne({ userId: req.user._id }).select('_id classId').lean();
    if (!requesterStudent || toId(requesterStudent._id) !== toId(admitCard.studentId?._id || admitCard.studentId)) {
      throw createHttpError(403, 'Forbidden');
    }

    const studentClassId = toId(requesterStudent.classId);
    const admitCardClassId = toId(admitCard.classId?._id || admitCard.classId);

    if (!admitCard.isFeePaid || !studentClassId || !admitCardClassId || studentClassId !== admitCardClassId) {
      throw createHttpError(403, 'Admit card download is not available yet');
    }

    if (isExamCompletedForAdmitCard(admitCard.examId)) {
      throw createHttpError(403, 'Admit card download is not available for completed exams');
    }
  }

  const generated = await createAdmitCardPdf({
    admitCard,
    exam: admitCard.examId,
    student: admitCard.studentId
  });

  const pdfBuffer = Buffer.isBuffer(generated.pdfBuffer)
    ? generated.pdfBuffer
    : Buffer.from(generated.pdfBuffer);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${generated.fileName}"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.setHeader('Cache-Control', 'no-store');
  res.send(pdfBuffer);
});

module.exports = {
  listMyAvailableAdmitCards: listMyAvailableAdmitCardsHandler,
  listExamAdmitCards: listExamAdmitCardsHandler,
  syncExamAdmitCards: syncExamAdmitCardsHandler,
  setAdmitCardFeeStatus: setAdmitCardFeeStatusHandler,
  downloadClassAdmitCardsZip: downloadClassAdmitCardsZipHandler,
  downloadAdmitCard: downloadAdmitCardHandler
};
