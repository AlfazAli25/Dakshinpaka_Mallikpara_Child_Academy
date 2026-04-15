const mongoose = require('mongoose');
const fs = require('fs');
const archiver = require('archiver');
const asyncHandler = require('../middleware/async.middleware');
const {
  getStudentReportCardByExam,
  getClassReportCardsZipPayload
} = require('../services/report-card.service');
const { createReportCardPdf } = require('../services/report-card-pdf.service');
const {
  getOrCreateGeneratedFile,
  streamGeneratedFile
} = require('../services/generated-file-cache.service');

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const buildCacheKey = (...parts) => parts.map((item) => String(item ?? '')).join(':');

const createReportCardsZipFile = ({ reportCards, targetFilePath }) =>
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
      for (const reportCard of reportCards) {
        const generatedPdf = await createReportCardPdf({ reportCardData: reportCard });
        const fileBuffer = Buffer.isBuffer(generatedPdf?.pdfBuffer)
          ? generatedPdf.pdfBuffer
          : Buffer.from(generatedPdf?.pdfBuffer || []);

        archive.append(fileBuffer, { name: String(generatedPdf?.fileName || 'Report_Card.pdf') });
      }

      await archive.finalize();
    })().catch((error) => {
      archive.abort();
      reject(error);
    });
  });

const getStudentReportCardStatusByExamHandler = asyncHandler(async (req, res) => {
  const examId = String(req.params?.examId || '').trim();
  const studentId = String(req.params?.studentId || '').trim();

  if (!mongoose.Types.ObjectId.isValid(examId)) {
    throw createHttpError(400, 'Invalid exam selected');
  }

  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw createHttpError(400, 'Invalid student selected');
  }

  const result = await getStudentReportCardByExam({
    examId,
    studentId
  });

  return res.json({
    success: true,
    data: {
      isDownloadReady: result.isDownloadReady,
      message: result.isDownloadReady ? 'Report card is ready to download' : result.reason,
      rollNumber: result.reportCard?.assignedRollNo || null,
      fileName: result.fileName,
      className: result.dataset?.classInfo?.className || '-',
      section: result.dataset?.classInfo?.section || '-',
      examYear: result.dataset?.academicYear || '-'
    }
  });
});

const downloadStudentReportCardByExamHandler = asyncHandler(async (req, res) => {
  const examId = String(req.params?.examId || '').trim();
  const studentId = String(req.params?.studentId || '').trim();

  if (!mongoose.Types.ObjectId.isValid(examId)) {
    throw createHttpError(400, 'Invalid exam selected');
  }

  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw createHttpError(400, 'Invalid student selected');
  }

  const result = await getStudentReportCardByExam({
    examId,
    studentId
  });

  if (!result.isDownloadReady) {
    throw createHttpError(409, result.reason || 'Report card download is not available yet');
  }

  const generatedFile = await getOrCreateGeneratedFile({
    cacheKey: buildCacheKey('report-card', 'student', studentId, 'exam', examId),
    fileName: result.fileName || 'Report_Card.pdf',
    contentType: 'application/pdf',
    ttlMs: 2 * 60 * 1000,
    generateBuffer: async () => {
      const generatedPdf = await createReportCardPdf({
        reportCardData: {
          ...result.reportCard,
          fileName: result.fileName
        }
      });

      return generatedPdf.pdfBuffer;
    }
  });

  await streamGeneratedFile(res, generatedFile, {
    'Cache-Control': 'private, max-age=60',
    'X-Generated-File-Cache': generatedFile.cacheHit ? 'HIT' : 'MISS'
  });
});

const downloadClassReportCardsZipHandler = asyncHandler(async (req, res) => {
  const classId = String(req.params?.classId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(classId)) {
    throw createHttpError(400, 'Invalid class selected');
  }

  const academicYear = String(req.query?.academicYear || '').trim();
  const section = String(req.query?.section || '').trim();

  const dataset = await getClassReportCardsZipPayload({
    classId,
    academicYear,
    section
  });


  const zipFileName = String(dataset?.zipFileName || 'Class_ReportCards.zip').trim() || 'Class_ReportCards.zip';
  const generatedFile = await getOrCreateGeneratedFile({
    cacheKey: buildCacheKey('report-card', 'class-zip', classId, academicYear || '-', section || '-', dataset.reportCards.length),
    fileName: zipFileName,
    contentType: 'application/zip',
    ttlMs: 2 * 60 * 1000,
    extension: '.zip',
    generateFile: async (targetFilePath) => {
      await createReportCardsZipFile({ reportCards: dataset.reportCards, targetFilePath });
    }
  });

  await streamGeneratedFile(res, generatedFile, {
    'Cache-Control': 'private, max-age=60',
    'X-Generated-File-Cache': generatedFile.cacheHit ? 'HIT' : 'MISS'
  });
});

module.exports = {
  getStudentReportCardStatusByExam: getStudentReportCardStatusByExamHandler,
  downloadStudentReportCardByExam: downloadStudentReportCardByExamHandler,
  downloadClassReportCardsZip: downloadClassReportCardsZipHandler
};
