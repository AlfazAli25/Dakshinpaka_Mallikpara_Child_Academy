const fs = require('fs/promises');
const path = require('path');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const { amountToWordsINR } = require('../utils/amount-in-words');
const {
  SCHOOL_NAME,
  SCHOOL_BRANCH_NAME,
  SCHOOL_ADDRESS,
  SCHOOL_MOBILE
} = require('../config/school');

const STUDENT_TEMPLATE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'templates',
  'receipts',
  'payment-receipt-design.html'
);

const TEACHER_TEMPLATE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'templates',
  'receipts',
  'teacher-salary-payment-receipt-design.html'
);

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SERVER_ROOT = path.resolve(__dirname, '..', '..');
const SCHOOL_LOGO_PATH = path.resolve(REPO_ROOT, 'client', 'public', 'School_Logo.png');
const DEFAULT_AVATAR_PATH = path.resolve(REPO_ROOT, 'client', 'public', 'default-student-avatar.svg');

const SUCCESSFUL_PAYMENT_STATUSES = new Set(['SUCCESS', 'PAID', 'VERIFIED']);
const SALARY_SUCCESS_STATUSES = new Set(['PAID', 'SUCCESS', 'VERIFIED']);

const LOCAL_CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];

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

const toSafeFileToken = (value, fallback = 'Receipt') =>
  toSafeText(value, fallback).replace(/[^A-Za-z0-9_-]/g, '_');

const padNumber = (value) => String(value).padStart(2, '0');

const formatDate = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return `${padNumber(parsed.getDate())}/${padNumber(parsed.getMonth() + 1)}/${parsed.getFullYear()}`;
};

const formatDateTime = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  let hours = parsed.getHours();
  const meridian = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  return `${formatDate(parsed)} ${padNumber(hours)}:${padNumber(parsed.getMinutes())} ${meridian}`;
};

const formatAmount = (value) => {
  const numeric = Number(value);
  const normalized = Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;

  return `INR ${normalized.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const normalizePaymentStatus = (status) => {
  const normalized = String(status || '').trim().toUpperCase();

  if (SUCCESSFUL_PAYMENT_STATUSES.has(normalized)) {
    return 'PAID';
  }

  if (normalized === 'PENDING_VERIFICATION') {
    return 'PENDING VERIFICATION';
  }

  if (normalized === 'FAILED' || normalized === 'REJECTED' || normalized === 'CANCELLED') {
    return 'FAILED';
  }

  return normalized || 'PENDING';
};

const normalizeSalaryStatus = (status) => {
  const normalized = String(status || '').trim().toUpperCase();

  if (SALARY_SUCCESS_STATUSES.has(normalized)) {
    return 'PAID';
  }

  if (normalized === 'PENDING') {
    return 'PENDING';
  }

  if (normalized === 'FAILED' || normalized === 'REJECTED' || normalized === 'CANCELLED') {
    return 'FAILED';
  }

  return normalized || 'PENDING';
};

const normalizePaymentMethod = (value) =>
  toSafeText(value, 'UNKNOWN').replace(/[_\s]+/g, ' ').trim().toUpperCase();

const buildPaymentForLabel = (payment = {}) => {
  const allocations = Array.isArray(payment.allocations) ? payment.allocations : [];
  const monthKeys = allocations
    .map((item) => String(item?.monthKey || '').trim())
    .filter(Boolean);

  if (monthKeys.length === 0) {
    return 'School Fee';
  }

  if (monthKeys.length === 1) {
    return `School Fee (${monthKeys[0]})`;
  }

  return `School Fee (${monthKeys[0]} to ${monthKeys[monthKeys.length - 1]})`;
};

const resolvePaymentThrough = (payment = {}) => {
  const processedBy = String(payment?.processedBy || '').trim().toUpperCase();
  if (processedBy === 'ADMIN' || payment?.processedByAdmin) {
    return 'Admin Panel';
  }

  return 'Student Panel';
};

const resolveStudentReceiptNumber = ({ payment, receipt }) => {
  const existingReceiptNumber = String(receipt?.receiptNumber || '').trim();
  if (existingReceiptNumber) {
    return existingReceiptNumber;
  }

  const transactionId = String(payment?.transactionId || '').trim();
  if (transactionId) {
    return `FEE-${transactionId}`;
  }

  return `FEE-${String(payment?._id || '').slice(-10) || Date.now()}`;
};

const resolveTeacherReceiptNumber = ({ payroll, receipt }) => {
  const existingReceiptNumber = String(receipt?.receiptNumber || '').trim();
  if (existingReceiptNumber) {
    return existingReceiptNumber;
  }

  const monthToken = String(payroll?.month || '').replace(/[^0-9-]/g, '').trim();
  if (monthToken) {
    return `SAL-${monthToken}-${String(payroll?._id || '').slice(-6)}`;
  }

  return `SAL-${String(payroll?._id || '').slice(-10) || Date.now()}`;
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

const loadLocalImageDataUri = async (filePath) => {
  const fileBuffer = await fs.readFile(filePath);
  return toDataUriFromBuffer(fileBuffer, resolveMimeType(filePath));
};

const loadRemoteImageDataUri = async (imageUrl) => {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error('Unable to fetch remote image');
  }

  const mimeType = response.headers.get('content-type') || 'image/png';
  const buffer = Buffer.from(await response.arrayBuffer());

  return toDataUriFromBuffer(buffer, mimeType);
};

const resolveStudentImageDataUri = async (student = {}) => {
  const profileImageUrl = String(student?.profileImageUrl || '').trim();

  if (profileImageUrl.startsWith('data:')) {
    return profileImageUrl;
  }

  if (/^https?:\/\//i.test(profileImageUrl)) {
    try {
      return await loadRemoteImageDataUri(profileImageUrl);
    } catch (_error) {
      // Continue to local fallbacks.
    }
  }

  if (profileImageUrl.startsWith('/')) {
    const normalized = profileImageUrl.replace(/^\/+/, '');
    const publicPath = path.resolve(REPO_ROOT, 'client', 'public', normalized);
    if (await fileExists(publicPath)) {
      return loadLocalImageDataUri(publicPath);
    }

    const serverRelativePath = path.resolve(SERVER_ROOT, normalized);
    if (await fileExists(serverRelativePath)) {
      return loadLocalImageDataUri(serverRelativePath);
    }
  }

  return loadLocalImageDataUri(DEFAULT_AVATAR_PATH);
};

const resolveSchoolLogoDataUri = async () => {
  if (await fileExists(SCHOOL_LOGO_PATH)) {
    return loadLocalImageDataUri(SCHOOL_LOGO_PATH);
  }

  throw createHttpError('School logo is missing', 500);
};

const getTemplatePath = (templateType) => {
  if (templateType === 'teacher') {
    return TEACHER_TEMPLATE_PATH;
  }

  return STUDENT_TEMPLATE_PATH;
};

const loadTemplateHtml = async (templateType = 'student') => {
  if (templateCache.has(templateType)) {
    return templateCache.get(templateType);
  }

  const templatePath = getTemplatePath(templateType);

  try {
    const template = await fs.readFile(templatePath, 'utf8');
    templateCache.set(templateType, template);
    return template;
  } catch (_error) {
    throw createHttpError('Receipt template missing', 500);
  }
};

const renderTemplate = (templateHtml, model) =>
  String(templateHtml || '').replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_fullMatch, key) => {
    if (key === 'schoolLogo' || key === 'studentProfileImage') {
      return String(model[key] || '');
    }

    return escapeHtml(model[key] ?? '');
  });

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

const buildStudentTemplateModel = async ({ payment, student, receipt }) => {
  const [schoolLogo, studentProfileImage] = await Promise.all([
    resolveSchoolLogoDataUri(),
    resolveStudentImageDataUri(student)
  ]);

  const className = toSafeText(student?.classId?.name || receipt?.className);
  const sectionName = toSafeText(student?.classId?.section || '-');
  const amountPaid = Number(payment?.amount || receipt?.amount || 0);
  const paymentDateTimeValue = payment?.paidAt || payment?.verifiedAt || payment?.updatedAt || payment?.createdAt || receipt?.paymentDate;

  return {
    schoolLogo,
    studentProfileImage,
    schoolName: toSafeText(SCHOOL_BRANCH_NAME || SCHOOL_NAME, SCHOOL_NAME),
    schoolAddress: toSafeText(SCHOOL_ADDRESS),
    schoolPhone: toSafeText(SCHOOL_MOBILE),
    receiptNumber: resolveStudentReceiptNumber({ payment, receipt }),
    studentName: toSafeText(student?.userId?.name || receipt?.studentName, 'Student'),
    studentId: toSafeText(student?.admissionNo || student?._id),
    studentRollNumber: toSafeText(student?.rollNo),
    class: className,
    section: sectionName,
    amountPaid: formatAmount(amountPaid),
    paymentFor: buildPaymentForLabel(payment),
    paymentMethod: normalizePaymentMethod(payment?.paymentMethod || receipt?.paymentMethod),
    paymentThrough: resolvePaymentThrough(payment),
    paymentDateTime: formatDateTime(paymentDateTimeValue),
    status: normalizePaymentStatus(payment?.paymentStatus || receipt?.status),
    amountInWords: amountToWordsINR(amountPaid),
    receiptDownloadDate: formatDate(new Date())
  };
};

const buildTeacherTemplateModel = async ({ payroll, teacher, receipt }) => {
  const schoolLogo = await resolveSchoolLogoDataUri();

  const amountPaid = Number(
    receipt?.amountPaid ??
      receipt?.pendingSalaryCleared ??
      payroll?.pendingSalaryCleared ??
      payroll?.amount ??
      receipt?.amount ??
      0
  );

  const monthlySalary = Number(
    receipt?.monthlySalary ??
      teacher?.monthlySalary ??
      payroll?.amount ??
      0
  );

  const pendingSalary = Number(
    receipt?.pendingSalary ??
      teacher?.pendingSalary ??
      0
  );

  const paymentDateValue = receipt?.paymentDate || payroll?.paidOn || payroll?.updatedAt || payroll?.createdAt;

  return {
    schoolLogo,
    schoolName: toSafeText(SCHOOL_BRANCH_NAME || SCHOOL_NAME, SCHOOL_NAME),
    schoolAddress: toSafeText(SCHOOL_ADDRESS),
    schoolPhone: toSafeText(SCHOOL_MOBILE),
    receiptNumber: resolveTeacherReceiptNumber({ payroll, receipt }),
    teacherName: toSafeText(teacher?.userId?.name || receipt?.teacherName, 'Teacher'),
    monthlySalary: formatAmount(monthlySalary),
    paymentDate: formatDate(paymentDateValue),
    paymentMethod: normalizePaymentMethod(receipt?.paymentMethod || payroll?.paymentMethod),
    amountPaid: formatAmount(amountPaid),
    amountInWords: amountToWordsINR(amountPaid),
    pendingSalary: formatAmount(pendingSalary),
    status: normalizeSalaryStatus(receipt?.status || payroll?.status || 'PAID'),
    receiptDownloadDate: formatDate(new Date())
  };
};

const generatePdfFromHtml = async ({ html, receiptNumber, filePrefix }) => {
  let browser;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 2 });
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 45000
    });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0'
      }
    });

    return {
      pdfBuffer,
      fileName: `${filePrefix}_${toSafeFileToken(receiptNumber)}.pdf`,
      generator: 'template-html-puppeteer-v2'
    };
  } catch (error) {
    throw createHttpError(error?.message || 'PDF generation failure', Number(error?.statusCode || 500));
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
};

const createTemplateReceiptPdf = async ({ payment, student, receipt }) => {
  const templateHtml = await loadTemplateHtml('student');
  const model = await buildStudentTemplateModel({ payment, student, receipt });
  const finalHtml = renderTemplate(templateHtml, model);

  return generatePdfFromHtml({
    html: finalHtml,
    receiptNumber: model.receiptNumber,
    filePrefix: 'Fee_Receipt'
  });
};

const createTemplateTeacherSalaryReceiptPdf = async ({ payroll, teacher, receipt }) => {
  const templateHtml = await loadTemplateHtml('teacher');
  const model = await buildTeacherTemplateModel({ payroll, teacher, receipt });
  const finalHtml = renderTemplate(templateHtml, model);

  return generatePdfFromHtml({
    html: finalHtml,
    receiptNumber: model.receiptNumber,
    filePrefix: 'Salary_Receipt'
  });
};

module.exports = {
  createTemplateReceiptPdf,
  createTemplateTeacherSalaryReceiptPdf
};
