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
  SCHOOL_BRANCH_NAME,
  SCHOOL_ADDRESS,
  SCHOOL_MOBILE,
  SCHOOL_WEBSITE_URL,
  SCHOOL_TIME_ZONE
} = require('../config/school');

const { generateQrCodeDataUri } = require('../utils/qr-code');

const TEMPLATE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'templates',
  'id-cards',
  'student-id-card-design.html'
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
  maxWidth: 720,
  maxHeight: 720,
  quality: 70
};

const PROFILE_IMAGE_OPTIONS = {
  maxWidth: 520,
  maxHeight: 520,
  quality: 72
};

const CARD_WIDTH_MM = 86;
const CARD_HEIGHT_MM = 54;

const templateCache = new Map();

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const toSafeText = (value, fallback = '-') => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

const toSafeFileToken = (value, fallback = 'Student') => {
  const normalized = toSafeText(value, fallback).replace(/[^A-Za-z0-9_-]/g, '_');
  return normalized || fallback;
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

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

const ID_CARD_TIME_ZONE = resolveTimeZone(SCHOOL_TIME_ZONE);

const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: ID_CARD_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});

const toValidDate = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const formatDate = (value, fallback = '-') => {
  const parsed = toValidDate(value);
  if (!parsed) {
    return fallback;
  }

  return DATE_FORMATTER.format(parsed);
};

const getDefaultValidUpto = () => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const targetYear = currentMonth >= 3 ? now.getFullYear() + 1 : now.getFullYear();
  return `31/03/${targetYear}`;
};

const getDefaultAcademicSession = () => {
  const now = new Date();
  const currentMonth = now.getMonth();

  if (currentMonth >= 3) {
    return `${now.getFullYear()}-${now.getFullYear() + 1}`;
  }

  return `${now.getFullYear() - 1}-${now.getFullYear()}`;
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
  const cacheKey = 'student-id-card';
  if (templateCache.has(cacheKey)) {
    return templateCache.get(cacheKey);
  }

  try {
    const templateHtml = await fs.readFile(TEMPLATE_PATH, 'utf8');
    templateCache.set(cacheKey, templateHtml);
    return templateHtml;
  } catch (_error) {
    throw createHttpError('Student ID card template missing', 500);
  }
};

const renderTemplate = (templateHtml, model) =>
  String(templateHtml || '').replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_fullMatch, key) => {
    if (key === 'schoolLogo' || key === 'studentPhoto' || key === 'studentQrCode') {
      return String(model[key] || '');
    }

    return escapeHtml(model[key] ?? '');
  });

const buildStudentIdCardFileName = ({ student = {} } = {}) => {
  const studentToken = toSafeFileToken(student?.admissionNo || student?.userId?.name, 'Student');
  return `Student_ID_Card_${studentToken}.pdf`;
};

const buildStudentQrPayloads = ({
  studentName,
  studentId,
  classLabel,
  rollNo,
  guardianContact,
  schoolName
}) => {
  const compactPayload = {
    t: 'SID',
    v: 1,
    st: [studentName, studentId, classLabel, rollNo, guardianContact],
    sc: schoolName
  };

  const verbosePayload = {
    documentType: 'STUDENT_ID_CARD',
    version: 1,
    schoolName,
    student: {
      name: studentName,
      studentId,
      classLabel,
      rollNo,
      guardianContact
    }
  };

  const scannableTextPayload = [
    'DMCA STUDENT ID',
    `NAME:${studentName}`,
    `ID:${studentId}`,
    `CLASS:${classLabel}`,
    `ROLL:${rollNo}`
  ].join('/');

  return [scannableTextPayload, compactPayload, verbosePayload, toSafeText(SCHOOL_WEBSITE_URL, 'http://localhost:3000')];
};

const buildTemplateModel = async ({ student = {} }) => {
  const studentName = toSafeText(student?.userId?.name, '-');
  const studentId = toSafeText(student?.admissionNo || student?._id, '-');
  const className = toSafeText(student?.classId?.name, '-');
  const section = toSafeText(student?.classId?.section, '-');
  const classLabel = section !== '-' ? `${className} (${section})` : className;
  const rollNo = toSafeText(student?.rollNo, '-');
  const guardianContact = toSafeText(student?.guardianContact, '-');
  const dateOfBirth = formatDate(student?.dob, '-');
  const issueDate = formatDate(new Date(), '-');
  const validUpto = toSafeText(process.env.STUDENT_ID_CARD_VALID_UPTO, getDefaultValidUpto());
  const academicSession = toSafeText(process.env.STUDENT_ACADEMIC_SESSION, getDefaultAcademicSession());
  const schoolRegLine = toSafeText(
    process.env.SCHOOL_REGISTRATION_LINE,
    'Estd: 2018 | Regd. No: IV-090/00520/2018'
  );
  const schoolPhone = toSafeText(SCHOOL_MOBILE).replace(/\s*,\s*/g, ' | ');
  const websiteLabel = toSafeText(SCHOOL_WEBSITE_URL, '-')
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/g, '') || '-';

  const studentQrPayloads = buildStudentQrPayloads({
    studentName,
    studentId,
    classLabel,
    rollNo,
    guardianContact,
    schoolName: toSafeText(SCHOOL_NAME)
  });

  const [schoolLogo, studentPhoto, studentQrCode] = await Promise.all([
    resolveSchoolLogoDataUri(),
    resolveStudentImageDataUri(student),
    generateQrCodeDataUri({
      payloads: studentQrPayloads,
      width: 360,
      margin: 2,
      errorCorrectionLevel: 'M'
    })
  ]);

  return {
    schoolLogo,
    studentPhoto,
    studentQrCode,
    schoolName: toSafeText(SCHOOL_NAME),
    schoolBranchName: toSafeText(SCHOOL_BRANCH_NAME, toSafeText(SCHOOL_NAME)),
    schoolAddress: toSafeText(SCHOOL_ADDRESS),
    schoolPhone,
    schoolRegLine,
    schoolWebsite: websiteLabel,
    studentName,
    studentId,
    className,
    section,
    classLabel,
    rollNo,
    guardianContact,
    dateOfBirth,
    issueDate,
    academicSession,
    validUpto
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
    await page.setViewport({ width: 980, height: 620, deviceScaleFactor: 1 });
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 45000
    });

    const pdfBytes = await page.pdf({
      width: `${CARD_WIDTH_MM}mm`,
      height: `${CARD_HEIGHT_MM}mm`,
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
      generator: 'student-id-card-template-puppeteer-v1'
    };
  } catch (error) {
    throw createHttpError(error?.message || 'PDF generation failure', Number(error?.statusCode || 500));
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
};

const createStudentIdCardPdf = async ({ student = {} }) => {
  const templateHtml = await loadTemplateHtml();
  const model = await buildTemplateModel({ student });
  const finalHtml = renderTemplate(templateHtml, model);

  return generatePdfFromHtml({
    html: finalHtml,
    fileName: buildStudentIdCardFileName({ student })
  });
};

module.exports = {
  createStudentIdCardPdf,
  buildStudentIdCardFileName
};
