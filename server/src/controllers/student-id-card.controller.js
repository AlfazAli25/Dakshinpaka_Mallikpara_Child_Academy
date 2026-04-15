const mongoose = require('mongoose');
const fs = require('fs');
const archiver = require('archiver');
const asyncHandler = require('../middleware/async.middleware');
const Student = require('../models/student.model');
const {
  createStudentIdCardPdf,
  createStudentIdCardPreviewImage,
  buildStudentIdCardFileName
} = require('../services/student-id-card-pdf.service');
const {
  getOrCreateGeneratedFile,
  streamGeneratedFile
} = require('../services/generated-file-cache.service');

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const toSafeFileToken = (value, fallback = 'File') => {
  const normalized = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '_');

  return normalized || fallback;
};

const buildCacheKey = (...parts) => parts.map((item) => String(item ?? '')).join(':');

const compareStudents = (left, right) => {
  const leftRoll = Number(left?.rollNo);
  const rightRoll = Number(right?.rollNo);
  const leftHasRoll = Number.isFinite(leftRoll) && leftRoll > 0;
  const rightHasRoll = Number.isFinite(rightRoll) && rightRoll > 0;

  if (leftHasRoll && rightHasRoll && leftRoll !== rightRoll) {
    return leftRoll - rightRoll;
  }

  if (leftHasRoll !== rightHasRoll) {
    return leftHasRoll ? -1 : 1;
  }

  const leftName = String(left?.userId?.name || '').trim().toLowerCase();
  const rightName = String(right?.userId?.name || '').trim().toLowerCase();
  const nameCompare = leftName.localeCompare(rightName, 'en', { sensitivity: 'base' });
  if (nameCompare !== 0) {
    return nameCompare;
  }

  const leftAdmissionNo = String(left?.admissionNo || '').trim();
  const rightAdmissionNo = String(right?.admissionNo || '').trim();
  return leftAdmissionNo.localeCompare(rightAdmissionNo, 'en', { sensitivity: 'base' });
};

const findStudentById = async (studentId) =>
  Student.findById(studentId)
    .select('admissionNo rollNo profileImageUrl classId userId guardianContact dob updatedAt')
    .populate({ path: 'userId', select: 'name email' })
    .populate({ path: 'classId', select: 'name section' })
    .lean();

const findStudentByUserId = async (userId) =>
  Student.findOne({ userId })
    .select('admissionNo rollNo profileImageUrl classId userId guardianContact dob updatedAt')
    .populate({ path: 'userId', select: 'name email' })
    .populate({ path: 'classId', select: 'name section' })
    .lean();

const listStudentsByClassId = async (classId) => {
  const students = await Student.find({ classId })
    .select('admissionNo rollNo profileImageUrl classId userId guardianContact dob updatedAt')
    .populate({ path: 'userId', select: 'name email' })
    .populate({ path: 'classId', select: 'name section' })
    .lean();

  return students.sort(compareStudents);
};

const createClassIdCardsZipFile = ({ students, targetFilePath }) =>
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
      for (const student of students) {
        const generated = await createStudentIdCardPdf({ student });
        const pdfBuffer = Buffer.isBuffer(generated?.pdfBuffer)
          ? generated.pdfBuffer
          : Buffer.from(generated?.pdfBuffer || []);

        archive.append(pdfBuffer, {
          name: String(generated?.fileName || buildStudentIdCardFileName({ student }))
        });
      }

      await archive.finalize();
    })().catch((error) => {
      archive.abort();
      reject(error);
    });
  });

const downloadStudentIdCardHandler = asyncHandler(async (req, res) => {
  const studentId = String(req.params?.studentId || '').trim();

  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw createHttpError(400, 'Invalid student selected');
  }

  const student = await findStudentById(studentId);
  if (!student) {
    throw createHttpError(404, 'Student not found');
  }

  const generatedFile = await getOrCreateGeneratedFile({
    cacheKey: buildCacheKey(
      'student-id-card',
      'single',
      studentId,
      String(student?.updatedAt || ''),
      String(student?.profileImageUrl || '')
    ),
    fileName: buildStudentIdCardFileName({ student }),
    contentType: 'application/pdf',
    ttlMs: 2 * 60 * 1000,
    generateBuffer: async () => {
      const generated = await createStudentIdCardPdf({ student });
      return generated.pdfBuffer;
    }
  });

  await streamGeneratedFile(res, generatedFile, {
    'Cache-Control': 'private, max-age=60',
    'X-Generated-File-Cache': generatedFile.cacheHit ? 'HIT' : 'MISS'
  });
});

const downloadMyStudentIdCardHandler = asyncHandler(async (req, res) => {
  const userId = String(req.user?._id || '').trim();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw createHttpError(401, 'Unauthorized');
  }

  const student = await findStudentByUserId(userId);
  if (!student) {
    throw createHttpError(404, 'Student profile not found');
  }

  const generatedFile = await getOrCreateGeneratedFile({
    cacheKey: buildCacheKey(
      'student-id-card',
      'self',
      userId,
      String(student?.updatedAt || ''),
      String(student?.profileImageUrl || '')
    ),
    fileName: buildStudentIdCardFileName({ student }),
    contentType: 'application/pdf',
    ttlMs: 2 * 60 * 1000,
    generateBuffer: async () => {
      const generated = await createStudentIdCardPdf({ student });
      return generated.pdfBuffer;
    }
  });

  await streamGeneratedFile(res, generatedFile, {
    'Cache-Control': 'private, max-age=60',
    'X-Generated-File-Cache': generatedFile.cacheHit ? 'HIT' : 'MISS'
  });
});

const previewMyStudentIdCardHandler = asyncHandler(async (req, res) => {
  const userId = String(req.user?._id || '').trim();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw createHttpError(401, 'Unauthorized');
  }

  const student = await findStudentByUserId(userId);
  if (!student) {
    throw createHttpError(404, 'Student profile not found');
  }

  const generatedFile = await getOrCreateGeneratedFile({
    cacheKey: buildCacheKey(
      'student-id-card',
      'self-preview',
      userId,
      String(student?.updatedAt || ''),
      String(student?.profileImageUrl || '')
    ),
    fileName: buildStudentIdCardFileName({ student }).replace(/\.pdf$/i, '_Preview.png'),
    contentType: 'image/png',
    ttlMs: 2 * 60 * 1000,
    generateBuffer: async () => {
      const generated = await createStudentIdCardPreviewImage({ student });
      return generated.imageBuffer;
    }
  });

  await streamGeneratedFile(res, generatedFile, {
    'Cache-Control': 'private, max-age=60',
    'X-Generated-File-Cache': generatedFile.cacheHit ? 'HIT' : 'MISS'
  });
});

const downloadClassIdCardsZipHandler = asyncHandler(async (req, res) => {
  const classId = String(req.params?.classId || '').trim();

  if (!mongoose.Types.ObjectId.isValid(classId)) {
    throw createHttpError(400, 'Invalid class selected');
  }

  const students = await listStudentsByClassId(classId);
  if (students.length === 0) {
    throw createHttpError(404, 'No students found in this class');
  }

  const firstStudent = students[0] || {};
  const className = String(firstStudent?.classId?.name || 'Class').trim() || 'Class';
  const section = String(firstStudent?.classId?.section || '').trim();
  const freshnessToken = String(
    Math.max(
      ...students.map((item) => {
        const timestamp = new Date(item?.updatedAt || 0).getTime();
        return Number.isFinite(timestamp) ? timestamp : 0;
      })
    )
  );

  const zipFileName = `Class_${toSafeFileToken(className, 'Class')}_${toSafeFileToken(section || 'NA', 'NA')}_ID_Cards.zip`;

  const generatedFile = await getOrCreateGeneratedFile({
    cacheKey: buildCacheKey('student-id-card', 'class-zip', classId, students.length, freshnessToken),
    fileName: zipFileName,
    contentType: 'application/zip',
    ttlMs: 2 * 60 * 1000,
    extension: '.zip',
    generateFile: async (targetFilePath) => {
      await createClassIdCardsZipFile({ students, targetFilePath });
    }
  });

  await streamGeneratedFile(res, generatedFile, {
    'Cache-Control': 'private, max-age=60',
    'X-Generated-File-Cache': generatedFile.cacheHit ? 'HIT' : 'MISS'
  });
});

module.exports = {
  downloadStudentIdCard: downloadStudentIdCardHandler,
  downloadMyStudentIdCard: downloadMyStudentIdCardHandler,
  previewMyStudentIdCard: previewMyStudentIdCardHandler,
  downloadClassIdCardsZip: downloadClassIdCardsZipHandler
};
