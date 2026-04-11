const mongoose = require('mongoose');
const fs = require('fs');
const archiver = require('archiver');
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
const { isExamCompletedForAdmitCard } = require('../utils/admit-card-exam-completion');
const {
  getOrCreateGeneratedFile,
  streamGeneratedFile
} = require('../services/generated-file-cache.service');

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const toId = (value) => String(value?._id || value || '').trim();
const buildCacheKey = (...parts) => parts.map((item) => String(item ?? '')).join(':');

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

const createAdmitCardsZipFile = ({ classCards, targetFilePath }) =>
  new Promise((resolve, reject) => {
    const output = fs.createWriteStream(targetFilePath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', resolve);
    output.on('error', reject);

    archive.on('warning', (error) => {
      if (error?.code === 'ENOENT') {
        return;
      }

      reject(error);
    });

    archive.on('error', reject);
    archive.pipe(output);

    (async () => {
      for (const admitCard of classCards) {
        const generated = await createAdmitCardPdf({
          admitCard,
          exam: admitCard.examId,
          student: admitCard.studentId
        });

        const pdfBuffer = Buffer.isBuffer(generated?.pdfBuffer)
          ? generated.pdfBuffer
          : Buffer.from(generated?.pdfBuffer || []);

        archive.append(pdfBuffer, { name: String(generated?.fileName || 'Admit_Card.pdf') });
      }

      await archive.finalize();
    })().catch((error) => {
      archive.abort();
      reject(error);
    });
  });

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
    .populate({ path: 'examId', select: 'examName academicYear startDate endDate examDate date status schedule' })
    .lean();

  const availableCards = data.filter(
    (item) => !isExamCompletedForAdmitCard({ exam: item?.examId, admitCard: item })
  );

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

  const firstCard = classCards[0] || {};
  const className = String(firstCard?.classId?.name || 'Class').trim();
  const classSection = String(firstCard?.classId?.section || '').trim();
  const classLabel = classSection ? `${className}_${classSection}` : className;
  const examName = String(firstCard?.examId?.examName || firstCard?.examName || 'Exam').trim();

  const zipFileName =
    `Admit_Cards_${toSafeFileToken(classLabel, 'Class')}_${toSafeFileToken(examName, 'Exam')}.zip`;

  const generatedFile = await getOrCreateGeneratedFile({
    cacheKey: buildCacheKey('admit-card', 'class-zip', examId, classId, classCards.length),
    fileName: zipFileName,
    contentType: 'application/zip',
    ttlMs: 2 * 60 * 1000,
    extension: '.zip',
    generateFile: async (targetFilePath) => {
      await createAdmitCardsZipFile({ classCards, targetFilePath });
    }
  });

  await streamGeneratedFile(res, generatedFile, {
    'Cache-Control': 'private, max-age=60',
    'X-Generated-File-Cache': generatedFile.cacheHit ? 'HIT' : 'MISS'
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

    if (isExamCompletedForAdmitCard({ exam: admitCard.examId, admitCard })) {
      throw createHttpError(403, 'Admit card download is not available for completed exams');
    }
  }

  const generatedFile = await getOrCreateGeneratedFile({
    cacheKey: buildCacheKey('admit-card', 'single', admitCardId, admitCard?.updatedAt || ''),
    fileName: admitCard?.fileName || `Admit_Card_${toSafeFileToken(admitCard?.studentId?.userId?.name || 'Student')}.pdf`,
    contentType: 'application/pdf',
    ttlMs: 2 * 60 * 1000,
    generateBuffer: async () => {
      const generated = await createAdmitCardPdf({
        admitCard,
        exam: admitCard.examId,
        student: admitCard.studentId
      });

      return generated.pdfBuffer;
    }
  });

  await streamGeneratedFile(res, generatedFile, {
    'Cache-Control': 'private, max-age=60',
    'X-Generated-File-Cache': generatedFile.cacheHit ? 'HIT' : 'MISS'
  });
});

module.exports = {
  listMyAvailableAdmitCards: listMyAvailableAdmitCardsHandler,
  listExamAdmitCards: listExamAdmitCardsHandler,
  syncExamAdmitCards: syncExamAdmitCardsHandler,
  setAdmitCardFeeStatus: setAdmitCardFeeStatusHandler,
  downloadClassAdmitCardsZip: downloadClassAdmitCardsZipHandler,
  downloadAdmitCard: downloadAdmitCardHandler
};
