const mongoose = require('mongoose');
const asyncHandler = require('../middleware/async.middleware');
const Student = require('../models/student.model');
const {
  syncAdmitCardsForExam,
  listAdmitCardsByExam,
  updateAdmitCardEligibility,
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

const setAdmitCardEligibilityHandler = asyncHandler(async (req, res) => {
  const admitCardId = String(req.params?.admitCardId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(admitCardId)) {
    throw createHttpError(400, 'Invalid admit card selected');
  }

  const isEligible = toBooleanInput(req.body?.isEligible);
  if (isEligible === null) {
    throw createHttpError(400, 'isEligible must be true or false');
  }

  const data = await updateAdmitCardEligibility({
    admitCardId,
    isEligible,
    actorUserId: req.user?._id
  });

  res.json({
    success: true,
    message: 'Admit card eligibility updated successfully',
    data
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

const downloadAdmitCardHandler = asyncHandler(async (req, res) => {
  const admitCardId = String(req.params?.admitCardId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(admitCardId)) {
    throw createHttpError(400, 'Invalid admit card selected');
  }

  const admitCard = await getAdmitCardById(admitCardId);
  if (!admitCard || !admitCard.isActive) {
    throw createHttpError(404, 'Admit card not found');
  }

  if (!admitCard.isDownloadEnabled) {
    throw createHttpError(403, 'Admit card download is not available yet');
  }

  if (req.user?.role === 'student') {
    const requesterStudent = await Student.findOne({ userId: req.user._id }).select('_id').lean();
    if (!requesterStudent || toId(requesterStudent._id) !== toId(admitCard.studentId?._id || admitCard.studentId)) {
      throw createHttpError(403, 'Forbidden');
    }
  }

  const generated = await createAdmitCardPdf({
    admitCard,
    exam: admitCard.examId,
    student: admitCard.studentId
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${generated.fileName}"`);
  res.setHeader('Content-Length', generated.pdfBuffer.length);
  res.setHeader('Cache-Control', 'no-store');
  res.send(generated.pdfBuffer);
});

module.exports = {
  listExamAdmitCards: listExamAdmitCardsHandler,
  syncExamAdmitCards: syncExamAdmitCardsHandler,
  setAdmitCardEligibility: setAdmitCardEligibilityHandler,
  setAdmitCardFeeStatus: setAdmitCardFeeStatusHandler,
  downloadAdmitCard: downloadAdmitCardHandler
};
