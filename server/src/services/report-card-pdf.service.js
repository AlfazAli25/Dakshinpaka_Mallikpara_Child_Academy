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
  SCHOOL_MOBILE
} = require('../config/school');

const { buildReportCardFileName } = require('./report-card.service');

const TEMPLATE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'templates',
  'report-cards',
  'student-report-card-design.html'
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
  quality: 66
};

const PROFILE_IMAGE_OPTIONS = {
  maxWidth: 560,
  maxHeight: 560,
  quality: 68
};

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

const toSafeFileToken = (value, fallback = 'ReportCard') =>
  toSafeText(value, fallback).replace(/[^A-Za-z0-9_-]/g, '_');

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

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

const resolveSchoolLogoDataUri = async () => {
  if (await fileExists(SCHOOL_LOGO_PATH)) {
    return loadLocalImageDataUri(SCHOOL_LOGO_PATH, LOGO_IMAGE_OPTIONS);
  }

  throw createHttpError('School logo is missing', 500);
};

const resolveStudentImageDataUri = async (reportCardData = {}) => {
  const profileImageUrl = toSafeText(reportCardData?.studentProfileImageUrl, '');

  if (profileImageUrl.startsWith('data:')) {
    return profileImageUrl;
  }

  if (/^https?:\/\//i.test(profileImageUrl)) {
    try {
      return await loadRemoteImageDataUri(profileImageUrl, PROFILE_IMAGE_OPTIONS);
    } catch (_error) {
      // Continue to local fallbacks.
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

const loadTemplateHtml = async () => {
  const cacheKey = 'student-report-card';
  if (templateCache.has(cacheKey)) {
    return templateCache.get(cacheKey);
  }

  try {
    const templateHtml = await fs.readFile(TEMPLATE_PATH, 'utf8');
    templateCache.set(cacheKey, templateHtml);
    return templateHtml;
  } catch (_error) {
    throw createHttpError('Report card template missing', 500);
  }
};

const renderTemplate = (templateHtml, model) =>
  String(templateHtml || '').replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_fullMatch, key) => {
    if (key === 'schoolLogo' || key === 'studentProfileImage' || key === 'tableRowsHtml') {
      return String(model[key] || '');
    }

    return escapeHtml(model[key] ?? '');
  });

const formatScore = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '-';
  }

  if (Number.isInteger(numeric)) {
    return String(numeric);
  }

  return numeric.toFixed(2);
};

const buildTableRowsHtml = (subjectRows = []) => {
  const rows = (Array.isArray(subjectRows) ? subjectRows : [])
    .slice(0, 9)
    .map((item) => ({
      subjectName: toSafeText(item?.subjectName, '-'),
      unitTest1Marks: formatScore(item?.unitTest1Marks),
      unitTest2Marks: formatScore(item?.unitTest2Marks),
      finalExamMarks: formatScore(item?.finalExamMarks),
      totalMaxMarks: formatScore(item?.totalMaxMarks),
      totalObtainedMarks: formatScore(item?.totalObtainedMarks)
    }));

  while (rows.length < 9) {
    rows.push({
      subjectName: '',
      unitTest1Marks: '',
      unitTest2Marks: '',
      finalExamMarks: '',
      totalMaxMarks: '',
      totalObtainedMarks: ''
    });
  }

  return rows
    .map(
      (item) =>
        `<tr>` +
        `<td>${escapeHtml(item.subjectName)}</td>` +
        `<td>${escapeHtml(item.unitTest1Marks)}</td>` +
        `<td>${escapeHtml(item.unitTest2Marks)}</td>` +
        `<td>${escapeHtml(item.finalExamMarks)}</td>` +
        `<td>${escapeHtml(item.totalMaxMarks)}</td>` +
        `<td>${escapeHtml(item.totalObtainedMarks)}</td>` +
        `</tr>`
    )
    .join('');
};

const buildTemplateModel = async ({ reportCardData = {} }) => {
  const [schoolLogo, studentProfileImage] = await Promise.all([
    resolveSchoolLogoDataUri(),
    resolveStudentImageDataUri(reportCardData)
  ]);

  return {
    schoolLogo,
    studentProfileImage,
    schoolName: toSafeText(SCHOOL_NAME).toUpperCase(),
    schoolAddress: toSafeText(SCHOOL_ADDRESS),
    schoolPhone: toSafeText(SCHOOL_MOBILE),
    studentName: toSafeText(reportCardData?.studentName, '-'),
    studentId: toSafeText(reportCardData?.admissionNo, '-'),
    className: toSafeText(reportCardData?.className, '-'),
    section: toSafeText(reportCardData?.section, '-'),
    examYear: toSafeText(reportCardData?.examYear, '-'),
    reportRollNo: formatScore(reportCardData?.assignedRollNo),
    grandTotalMaxMarks: formatScore(reportCardData?.grandTotalMaxMarks),
    grandTotalObtainedMarks: formatScore(reportCardData?.grandTotalObtainedMarks),
    tableRowsHtml: buildTableRowsHtml(reportCardData?.subjectRows)
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
      generator: 'report-card-template-puppeteer-v1'
    };
  } catch (error) {
    throw createHttpError(error?.message || 'PDF generation failure', Number(error?.statusCode || 500));
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
};

const createReportCardPdf = async ({ reportCardData = {} }) => {
  const templateHtml = await loadTemplateHtml();
  const model = await buildTemplateModel({ reportCardData });
  const finalHtml = renderTemplate(templateHtml, model);

  const fileName =
    toSafeText(reportCardData?.fileName, '') ||
    buildReportCardFileName({
      assignedRollNo: reportCardData?.assignedRollNo,
      studentName: reportCardData?.studentName
    }) ||
    `Report_Card_${toSafeFileToken(reportCardData?.studentName, 'Student')}.pdf`;

  return generatePdfFromHtml({
    html: finalHtml,
    fileName
  });
};

module.exports = {
  createReportCardPdf
};
