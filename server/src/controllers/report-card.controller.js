const mongoose = require('mongoose');
const AdmZip = require('adm-zip');
const asyncHandler = require('../middleware/async.middleware');
const Student = require('../models/student.model');
const {
  getStudentReportCardByExam,
  getClassReportCardsZipPayload
} = require('../services/report-card.service');
const { createReportCardPdf } = require('../services/report-card-pdf.service');

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const sendPdfResponse = (res, generatedPdf) => {
  const pdfBuffer = Buffer.isBuffer(generatedPdf?.pdfBuffer)
    ? generatedPdf.pdfBuffer
    : Buffer.from(generatedPdf?.pdfBuffer || []);

  const fileName = String(generatedPdf?.fileName || 'Report_Card.pdf').trim() || 'Report_Card.pdf';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.setHeader('Cache-Control', 'no-store');
  res.send(pdfBuffer);
};

const getMyReportCardStatusByExamHandler = asyncHandler(async (req, res) => {
  const examId = String(req.params?.examId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(examId)) {
    throw createHttpError(400, 'Invalid exam selected');
  }

  const student = await Student.findOne({ userId: req.user?._id }).select('_id').lean();
  if (!student?._id) {
    throw createHttpError(404, 'Student profile not found');
  }

  const result = await getStudentReportCardByExam({
    examId,
    studentId: student._id
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

const downloadMyReportCardByExamHandler = asyncHandler(async (req, res) => {
  const examId = String(req.params?.examId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(examId)) {
    throw createHttpError(400, 'Invalid exam selected');
  }

  const student = await Student.findOne({ userId: req.user?._id }).select('_id').lean();
  if (!student?._id) {
    throw createHttpError(404, 'Student profile not found');
  }

  const result = await getStudentReportCardByExam({
    examId,
    studentId: student._id
  });

  if (!result.isDownloadReady) {
    throw createHttpError(409, result.reason || 'Report card download is not available yet');
  }

  const generatedPdf = await createReportCardPdf({
    reportCardData: {
      ...result.reportCard,
      fileName: result.fileName
    }
  });

  sendPdfResponse(res, generatedPdf);
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

  const zip = new AdmZip();

  for (const reportCard of dataset.reportCards) {
    const generatedPdf = await createReportCardPdf({ reportCardData: reportCard });
    const fileBuffer = Buffer.isBuffer(generatedPdf?.pdfBuffer)
      ? generatedPdf.pdfBuffer
      : Buffer.from(generatedPdf?.pdfBuffer || []);

    zip.addFile(String(generatedPdf?.fileName || 'Report_Card.pdf'), fileBuffer);
  }

  const zipBuffer = zip.toBuffer();
  const zipFileName = String(dataset?.zipFileName || 'Class_ReportCards.zip').trim() || 'Class_ReportCards.zip';

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
  res.setHeader('Content-Length', zipBuffer.length);
  res.setHeader('Cache-Control', 'no-store');
  res.send(zipBuffer);
});

module.exports = {
  getMyReportCardStatusByExam: getMyReportCardStatusByExamHandler,
  downloadMyReportCardByExam: downloadMyReportCardByExamHandler,
  downloadClassReportCardsZip: downloadClassReportCardsZipHandler
};
