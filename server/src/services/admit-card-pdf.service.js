const fs = require('fs/promises');
const path = require('path');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

let sharp = null;
try {
  sharp = require('sharp');
} catch (_error) {
  sharp = null;
}

const {
  SCHOOL_NAME,
  SCHOOL_ADDRESS,
  SCHOOL_MOBILE,
  SCHOOL_TIME_ZONE,
  SCHOOL_WEBSITE_URL
} = require('../config/school');

const { generateQrCodeDataUri } = require('../utils/qr-code');

const TEMPLATE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'templates',
  'admit-cards',
  'student-admit-card-design.html'
);

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SERVER_ROOT = path.resolve(__dirname, '..', '..');
const SCHOOL_LOGO_PATH = path.resolve(REPO_ROOT, 'client', 'public', 'School_Logo.png');
const DEFAULT_AVATAR_PATH = path.resolve(REPO_ROOT, 'client', 'public', 'default-student-avatar.svg');

const LOCAL_CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];

const LOGO_IMAGE_OPTIONS = {
  maxWidth: 900,
  maxHeight: 900,
  quality: 68
};

const PROFILE_IMAGE_OPTIONS = {
  maxWidth: 520,
  maxHeight: 520,
  quality: 70
};

const templateCache = new Map();

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const toSafeText = (value, fallback = '-') => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

const toSafeFileToken = (value, fallback = 'AdmitCard') =>
  toSafeText(value, fallback).replace(/[^A-Za-z0-9_-]/g, '_');

const toQrAlphanumericSafeText = (value, fallback = '-') =>
  toSafeText(value, fallback)
    .toUpperCase()
    .replace(/[^A-Z0-9 $%*+\-./:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const resolveTimeZone = (value) => {
  const fallbackTimeZone = 'Asia/Kolkata';
  const normalized = String(value || '').trim();

  if (!normalized) {
    return fallbackTimeZone;
  }

  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: normalized }).format(new Date());
    return normalized;
  } catch (_error) {
    return fallbackTimeZone;
  }
};

const ADMIT_CARD_TIME_ZONE = resolveTimeZone(SCHOOL_TIME_ZONE);

const ADMIT_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: ADMIT_CARD_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});

const ADMIT_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: ADMIT_CARD_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

const toDate = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const formatDate = (value) => {
  const parsed = toDate(value);
  if (!parsed) {
    return '';
  }

  return ADMIT_DATE_FORMATTER.format(parsed);
};

const formatTime = (value) => {
  const parsed = toDate(value);
  if (!parsed) {
    return '';
  }

  return ADMIT_TIME_FORMATTER.format(parsed).replace(/\s/g, '');
};

const resolveMimeType = (filePath) => {
  const extension = String(path.extname(filePath) || '').toLowerCase();

  if (extension === '.png') {
    return 'image/png';
  }

  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }

  if (extension === '.svg') {
    return 'image/svg+xml';
  }

  if (extension === '.webp') {
    return 'image/webp';
  }

  return 'application/octet-stream';
};

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
};

const toDataUriFromBuffer = (buffer, mimeType) => `data:${mimeType};base64,${buffer.toString('base64')}`;

const canOptimizeMimeType = (mimeType) =>
  Boolean(sharp) && /^image\/(png|jpe?g|webp|gif|avif)$/i.test(String(mimeType || '').trim());

const optimizeImageBuffer = async ({ buffer, mimeType, maxWidth, maxHeight, quality }) => {
  if (!canOptimizeMimeType(mimeType) || !Buffer.isBuffer(buffer)) {
    return {
      buffer,
      mimeType
    };
  }

  try {
    const optimizedBuffer = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality, effort: 4 })
      .toBuffer();

    return {
      buffer: optimizedBuffer,
      mimeType: 'image/webp'
    };
  } catch (_error) {
    return {
      buffer,
      mimeType
    };
  }
};

const loadLocalImageDataUri = async (filePath, options = {}) => {
  const fileBuffer = await fs.readFile(filePath);
  const mimeType = resolveMimeType(filePath);

  const optimized = await optimizeImageBuffer({
    buffer: fileBuffer,
    mimeType,
    maxWidth: Number(options.maxWidth || 900),
    maxHeight: Number(options.maxHeight || 900),
    quality: Number(options.quality || 72)
  });

  return toDataUriFromBuffer(optimized.buffer, optimized.mimeType);
};

const loadRemoteImageDataUri = async (imageUrl, options = {}) => {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error('Unable to fetch remote image');
  }

  const mimeType = response.headers.get('content-type') || 'image/png';
  const rawBuffer = Buffer.from(await response.arrayBuffer());
  const optimized = await optimizeImageBuffer({
    buffer: rawBuffer,
    mimeType,
    maxWidth: Number(options.maxWidth || 900),
    maxHeight: Number(options.maxHeight || 900),
    quality: Number(options.quality || 72)
  });

  return toDataUriFromBuffer(optimized.buffer, optimized.mimeType);
};

const resolveStudentImageDataUri = async (student = {}) => {
  const profileImageUrl = String(student?.profileImageUrl || '').trim();

  if (profileImageUrl.startsWith('data:')) {
    return profileImageUrl;
  }

  if (/^https?:\/\//i.test(profileImageUrl)) {
    try {
      return await loadRemoteImageDataUri(profileImageUrl, PROFILE_IMAGE_OPTIONS);
    } catch (_error) {
      // Continue to local fallback.
    }
  }

  if (profileImageUrl.startsWith('/')) {
    const normalized = profileImageUrl.replace(/^\/+/, '');
    const publicPath = path.resolve(REPO_ROOT, 'client', 'public', normalized);
    if (await fileExists(publicPath)) {
      return loadLocalImageDataUri(publicPath, PROFILE_IMAGE_OPTIONS);
    }

    const serverRelativePath = path.resolve(SERVER_ROOT, normalized);
    if (await fileExists(serverRelativePath)) {
      return loadLocalImageDataUri(serverRelativePath, PROFILE_IMAGE_OPTIONS);
    }
  }

  return loadLocalImageDataUri(DEFAULT_AVATAR_PATH, PROFILE_IMAGE_OPTIONS);
};

const resolveSchoolLogoDataUri = async () => {
  if (await fileExists(SCHOOL_LOGO_PATH)) {
    return loadLocalImageDataUri(SCHOOL_LOGO_PATH, LOGO_IMAGE_OPTIONS);
  }

  throw createHttpError('School logo is missing', 500);
};

const loadTemplateHtml = async () => {
  const cacheKey = 'student-admit-card';
  if (templateCache.has(cacheKey)) {
    return templateCache.get(cacheKey);
  }

  try {
    const templateHtml = await fs.readFile(TEMPLATE_PATH, 'utf8');
    templateCache.set(cacheKey, templateHtml);
    return templateHtml;
  } catch (_error) {
    throw createHttpError('Admit card template missing', 500);
  }
};

const renderTemplate = (templateHtml, model) =>
  String(templateHtml || '').replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_fullMatch, key) => {
    if (key === 'schoolLogo' || key === 'studentProfileImage' || key === 'admitQrCode' || key === 'examRowsHtml') {
      return String(model[key] || '');
    }

    return escapeHtml(model[key] ?? '');
  });

const getScheduleRows = (admitCard = {}, exam = {}) => {
  const snapshotRows = Array.isArray(admitCard?.scheduleSnapshot) ? admitCard.scheduleSnapshot : [];
  if (snapshotRows.length > 0) {
    return snapshotRows;
  }

  const examScheduleRows = Array.isArray(exam?.schedule) ? exam.schedule : [];
  return examScheduleRows
    .map((item) => ({
      subjectName: item?.subjectId?.name || item?.subjectId?.code || 'Subject',
      startDate: item?.startDate,
      endDate: item?.endDate
    }))
    .filter((item) => item.startDate && item.endDate);
};

const buildExamRowsHtml = (scheduleRows = []) => {
  const rows = (Array.isArray(scheduleRows) ? scheduleRows : [])
    .slice(0, 5)
    .map((item) => {
      const dateLabel = formatDate(item?.startDate);
      const subjectLabel = toSafeText(item?.subjectName, 'Subject');
      const startTime = formatTime(item?.startDate);
      const endTime = formatTime(item?.endDate);
      const timeLabel = startTime && endTime ? `${startTime} - ${endTime}` : startTime || endTime || '';

      return {
        date: dateLabel,
        subject: subjectLabel,
        time: timeLabel
      };
    });

  while (rows.length < 5) {
    rows.push({ date: '', subject: '', time: '' });
  }

  return rows
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.subject)}</td><td>${escapeHtml(item.time)}</td></tr>`
    )
    .join('');
};

const toIsoString = (value) => {
  const parsed = toDate(value);
  return parsed ? parsed.toISOString() : '';
};

const buildAdmitQrPayloads = ({
  admitCard = {},
  exam = {},
  student = {},
  studentName = '-',
  studentId = '-',
  className = '-',
  section = '-',
  rollNo = '-',
  examName = '-',
  examYear = '-',
  scheduleRows = []
}) => {
  const normalizedScheduleRows = (Array.isArray(scheduleRows) ? scheduleRows : []).map((item) => ({
    subjectName: toSafeText(item?.subjectName || item?.subjectCode, 'Subject'),
    startDate: toIsoString(item?.startDate),
    endDate: toIsoString(item?.endDate),
    dateLabel: formatDate(item?.startDate),
    timeLabel:
      formatTime(item?.startDate) && formatTime(item?.endDate)
        ? `${formatTime(item?.startDate)} - ${formatTime(item?.endDate)}`
        : formatTime(item?.startDate) || formatTime(item?.endDate) || ''
  }));

  const verbosePayload = {
    documentType: 'ADMIT_CARD',
    version: 1,
    school: {
      name: toSafeText(SCHOOL_NAME),
      address: toSafeText(SCHOOL_ADDRESS),
      phone: toSafeText(SCHOOL_MOBILE)
    },
    student: {
      name: studentName,
      studentId,
      className,
      section,
      rollNo,
      admissionNo: toSafeText(student?.admissionNo, '-'),
      studentRecordId: toSafeText(student?._id, '-')
    },
    exam: {
      examName,
      examYear,
      examId: toSafeText(admitCard?.examId?._id || admitCard?.examId || exam?._id, '-'),
      examType: toSafeText(admitCard?.examType || exam?.examType, '-'),
      startDate: toIsoString(exam?.startDate),
      endDate: toIsoString(exam?.endDate)
    },
    schedule: normalizedScheduleRows
  };

  const compactPayload = {
    t: 'ADM',
    v: 1,
    sc: [toSafeText(SCHOOL_NAME), toSafeText(SCHOOL_ADDRESS), toSafeText(SCHOOL_MOBILE)],
    st: [studentName, studentId, className, section, rollNo],
    ex: [examName, examYear, toSafeText(admitCard?.examId?._id || admitCard?.examId || exam?._id, '-')],
    sch: normalizedScheduleRows.map((item) => [item.subjectName, item.startDate, item.endDate])
  };

  const schedulePayloadText = normalizedScheduleRows
    .map(
      (item, index) =>
        `${index + 1}.${toQrAlphanumericSafeText(item.subjectName, 'SUBJECT')}:${toQrAlphanumericSafeText(item.dateLabel, 'NA')}:${toQrAlphanumericSafeText(item.timeLabel, 'NA')}`
    )
    .join('/');

  const scannableTextPayload = [
    'DMCA ADMIT',
    `SN:${toQrAlphanumericSafeText(SCHOOL_NAME)}`,
    `SA:${toQrAlphanumericSafeText(SCHOOL_ADDRESS)}`,
    `SP:${toQrAlphanumericSafeText(SCHOOL_MOBILE)}`,
    `N:${toQrAlphanumericSafeText(studentName)}`,
    `SID:${toQrAlphanumericSafeText(studentId)}`,
    `CLS:${toQrAlphanumericSafeText(className)}`,
    `SEC:${toQrAlphanumericSafeText(section)}`,
    `ROLL:${toQrAlphanumericSafeText(rollNo)}`,
    `EX:${toQrAlphanumericSafeText(examName)}`,
    `YEAR:${toQrAlphanumericSafeText(examYear)}`,
    `SCH:${schedulePayloadText || 'NA'}`
  ].join('/');

  return [scannableTextPayload, compactPayload, verbosePayload];
};

const buildTemplateModel = async ({ admitCard = {}, exam = {}, student = {} }) => {
  const studentName = toSafeText(student?.userId?.name, '-');
  const studentId = toSafeText(student?.admissionNo || student?._id, '-');
  const className = toSafeText(student?.classId?.name || admitCard?.classId?.name, '-');
  const section = toSafeText(student?.classId?.section || admitCard?.classId?.section, '-');
  const rollNo = toSafeText(student?.rollNo, '-');
  const examName = toSafeText(admitCard?.examName || exam?.examName, '-');
  const examYear = toSafeText(admitCard?.academicYear || exam?.academicYear, '-');

  const scheduleRows = getScheduleRows(admitCard, exam);
  const admitQrPayloads = [toSafeText(SCHOOL_WEBSITE_URL, 'http://localhost:3000')];

  const [schoolLogo, studentProfileImage, admitQrCode] = await Promise.all([
    resolveSchoolLogoDataUri(),
    resolveStudentImageDataUri(student),
    generateQrCodeDataUri({
      payloads: admitQrPayloads,
      width: 560,
      margin: 3,
      errorCorrectionLevel: 'L'
    })
  ]);

  return {
    schoolLogo,
    studentProfileImage,
    admitQrCode,
    schoolName: toSafeText(SCHOOL_NAME),
    schoolAddress: toSafeText(SCHOOL_ADDRESS),
    schoolPhone: toSafeText(SCHOOL_MOBILE),
    studentName,
    studentId,
    className,
    section,
    rollNo,
    examName,
    examYear,
    examRowsHtml: buildExamRowsHtml(scheduleRows)
  };
};

const findLocalChromeExecutable = async () => {
  for (const candidate of LOCAL_CHROME_CANDIDATES) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return '';
};

const launchBrowser = async () => {
  const safetyArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
  let launchError = null;

  try {
    const executablePath = await chromium.executablePath();
    if (executablePath) {
      return await puppeteer.launch({
        args: [...chromium.args, ...safetyArgs],
        defaultViewport: chromium.defaultViewport,
        executablePath,
        headless: chromium.headless
      });
    }
  } catch (error) {
    launchError = error;
  }

  const configuredExecutablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.CHROME_PATH ||
    (await findLocalChromeExecutable());

  try {
    return await puppeteer.launch({
      executablePath: configuredExecutablePath || undefined,
      args: safetyArgs,
      headless: true
    });
  } catch (error) {
    launchError = error;
  }

  throw createHttpError(launchError?.message || 'PDF generation failure', 500);
};

const generatePdfFromHtml = async ({ html, fileName }) => {
  let browser;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1754, height: 1240, deviceScaleFactor: 1 });
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 45000
    });

    const pdfBytes = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0'
      }
    });

    const pdfBuffer = Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);

    return {
      pdfBuffer,
      fileName,
      generator: 'admit-card-template-puppeteer-v1'
    };
  } catch (error) {
    throw createHttpError(error?.message || 'PDF generation failure', Number(error?.statusCode || 500));
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
};

const createAdmitCardPdf = async ({ admitCard = {}, exam = {}, student = {} }) => {
  const templateHtml = await loadTemplateHtml();
  const model = await buildTemplateModel({ admitCard, exam, student });
  const finalHtml = renderTemplate(templateHtml, model);

  const studentToken = toSafeFileToken(student?.admissionNo || student?.userId?.name, 'Student');
  const examToken = toSafeFileToken(admitCard?.examName || exam?.examName, 'Exam');

  return generatePdfFromHtml({
    html: finalHtml,
    fileName: `Admit_Card_${studentToken}_${examToken}.pdf`
  });
};

module.exports = {
  createAdmitCardPdf
};
