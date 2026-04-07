const fs = require('fs/promises');
const path = require('path');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const PDFDocument = require('pdfkit');

const { amountToWordsINR } = require('../utils/amount-in-words');
const {
  SCHOOL_NAME,
  SCHOOL_BRANCH_NAME,
  SCHOOL_ADDRESS,
  SCHOOL_MOBILE
} = require('../config/school');

const LOGO_FILE_PATH = path.resolve(__dirname, '../../..', 'client', 'public', 'School_Logo.png');
const PDF_MARGIN = { top: '0', right: '0', bottom: '0', left: '0' };
const DEFAULT_VIEWPORT = { width: 1240, height: 1754, deviceScaleFactor: 2 };
const STUDENT_TEMPLATE_FILE = 'student-receipt.html';
const TEACHER_TEMPLATE_FILE = 'teacher-receipt.html';

const DEFAULT_STUDENT_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #ffffff; color: #0f172a; font-family: Arial, Helvetica, sans-serif; }
    .receipt-page { position: relative; width: 210mm; min-height: 297mm; padding: 14mm 13mm 12mm; overflow: hidden; }
    .watermark { position: absolute; inset: 0; display: flex; justify-content: center; align-items: center; pointer-events: none; z-index: 0; }
    .watermark img { width: 146mm; opacity: 0.085; transform: translateY(14mm); }
    .content { position: relative; z-index: 1; }
    .school-logo { display: block; width: 56mm; margin: 0 auto 2mm; }
    .receipt-title { margin: 0 0 2.5mm; text-align: center; color: #132a56; font-size: 13mm; font-weight: 900; letter-spacing: 0.3mm; }
    .school-details { width: fit-content; max-width: 100%; margin: 0 auto 7mm; border: 0.4mm solid #111827; border-radius: 2.3mm; padding: 2.1mm 2.8mm; background: rgba(255, 255, 255, 0.92); }
    .school-details-name { font-size: 5.2mm; font-weight: 800; text-transform: uppercase; line-height: 1.2; }
    .school-details-meta { font-size: 4.2mm; font-weight: 600; line-height: 1.35; }
    .fields { margin-top: 1mm; }
    .field-row { display: grid; grid-template-columns: 45mm 1fr; column-gap: 3.5mm; align-items: center; margin-bottom: 2.4mm; }
    .field-row.class-row { grid-template-columns: 45mm 1fr 11mm 30mm; }
    .field-row.spacer-top { margin-top: 6.4mm; }
    .field-row.download-row { margin-top: 2mm; grid-template-columns: 45mm 68mm; }
    .field-label { font-size: 4.6mm; font-weight: 700; color: #121826; }
    .field-label.download-label { font-size: 5mm; font-weight: 900; color: #132a56; }
    .small-label { text-align: right; font-size: 4.6mm; font-weight: 700; color: #121826; }
    .field-value { height: 9.2mm; border-radius: 2mm; background: #e8ebf4; padding: 0 3mm; display: flex; align-items: center; font-size: 4.2mm; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  </style>
</head>
<body>
  <div class="receipt-page">
    <div class="watermark">{{watermarkMarkup}}</div>
    <div class="content">
      {{logoMarkup}}
      <h1 class="receipt-title">FEE PAYMENT RECEIPT</h1>
      <div class="school-details">
        <div class="school-details-name">{{schoolName}}</div>
        <div class="school-details-meta">Address: {{schoolAddress}}</div>
        <div class="school-details-meta">Mob.: {{schoolMobile}}</div>
      </div>
      <div class="fields">
        <div class="field-row"><div class="field-label">Receipt Number:</div><div class="field-value">{{receiptNumber}}</div></div>
        <div class="field-row"><div class="field-label">Student Name:</div><div class="field-value">{{studentName}}</div></div>
        <div class="field-row"><div class="field-label">Student ID:</div><div class="field-value">{{studentId}}</div></div>
        <div class="field-row class-row"><div class="field-label">Class:</div><div class="field-value">{{className}}</div><div class="small-label">Sec:</div><div class="field-value">{{section}}</div></div>
        <div class="field-row"><div class="field-label">Amount Paid:</div><div class="field-value">{{amountPaid}}</div></div>
        <div class="field-row"><div class="field-label">Payment For:</div><div class="field-value">{{paymentFor}}</div></div>
        <div class="field-row"><div class="field-label">Payment Method:</div><div class="field-value">{{paymentMethod}}</div></div>
        <div class="field-row"><div class="field-label">Payment Date and Time:</div><div class="field-value">{{paymentDateTime}}</div></div>
        <div class="field-row"><div class="field-label">Status:</div><div class="field-value">{{status}}</div></div>
        <div class="field-row spacer-top"><div class="field-label">Amount in words:</div><div class="field-value">{{amountInWords}}</div></div>
        <div class="field-row download-row"><div class="field-label download-label">Receipt Download Date:</div><div class="field-value">{{receiptDownloadDate}}</div></div>
      </div>
    </div>
  </div>
</body>
</html>`;

const DEFAULT_TEACHER_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #ffffff; color: #0f172a; font-family: Arial, Helvetica, sans-serif; }
    .receipt-page { position: relative; width: 210mm; min-height: 297mm; padding: 14mm 13mm 12mm; overflow: hidden; }
    .watermark { position: absolute; inset: 0; display: flex; justify-content: center; align-items: center; pointer-events: none; z-index: 0; }
    .watermark img { width: 146mm; opacity: 0.085; transform: translateY(14mm); }
    .content { position: relative; z-index: 1; }
    .school-logo { display: block; width: 56mm; margin: 0 auto 2mm; }
    .receipt-title { margin: 0 0 2.5mm; text-align: center; color: #132a56; font-size: 12.5mm; font-weight: 900; letter-spacing: 0.3mm; }
    .school-details { width: fit-content; max-width: 100%; margin: 0 auto 7mm; border: 0.4mm solid #111827; border-radius: 2.3mm; padding: 2.1mm 2.8mm; background: rgba(255, 255, 255, 0.92); }
    .school-details-name { font-size: 5.2mm; font-weight: 800; text-transform: uppercase; line-height: 1.2; }
    .school-details-meta { font-size: 4.2mm; font-weight: 600; line-height: 1.35; }
    .fields { margin-top: 1mm; }
    .field-row { display: grid; grid-template-columns: 56mm 1fr; column-gap: 3.5mm; align-items: center; margin-bottom: 2.4mm; }
    .field-row.spacer-top { margin-top: 6.4mm; }
    .field-row.download-row { margin-top: 2mm; grid-template-columns: 56mm 68mm; }
    .field-label { font-size: 4.6mm; font-weight: 700; color: #121826; }
    .field-label.download-label { font-size: 5mm; font-weight: 900; color: #132a56; }
    .field-value { height: 9.2mm; border-radius: 2mm; background: #e8ebf4; padding: 0 3mm; display: flex; align-items: center; font-size: 4.2mm; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  </style>
</head>
<body>
  <div class="receipt-page">
    <div class="watermark">{{watermarkMarkup}}</div>
    <div class="content">
      {{logoMarkup}}
      <h1 class="receipt-title">SALARY PAYMENT RECEIPT</h1>
      <div class="school-details">
        <div class="school-details-name">{{schoolName}}</div>
        <div class="school-details-meta">Address: {{schoolAddress}}</div>
        <div class="school-details-meta">Mob.: {{schoolMobile}}</div>
      </div>
      <div class="fields">
        <div class="field-row"><div class="field-label">Receipt Number:</div><div class="field-value">{{receiptNumber}}</div></div>
        <div class="field-row"><div class="field-label">Teacher Name:</div><div class="field-value">{{teacherName}}</div></div>
        <div class="field-row"><div class="field-label">Teacher ID:</div><div class="field-value">{{teacherId}}</div></div>
        <div class="field-row"><div class="field-label">Payroll Month:</div><div class="field-value">{{payrollMonth}}</div></div>
        <div class="field-row"><div class="field-label">Monthly Salary:</div><div class="field-value">{{monthlySalary}}</div></div>
        <div class="field-row"><div class="field-label">Amount Paid:</div><div class="field-value">{{amountPaid}}</div></div>
        <div class="field-row"><div class="field-label">Pending Salary:</div><div class="field-value">{{pendingSalary}}</div></div>
        <div class="field-row"><div class="field-label">Payment Method:</div><div class="field-value">{{paymentMethod}}</div></div>
        <div class="field-row"><div class="field-label">Payment Date and Time:</div><div class="field-value">{{paymentDateTime}}</div></div>
        <div class="field-row"><div class="field-label">Status:</div><div class="field-value">{{status}}</div></div>
        <div class="field-row spacer-top"><div class="field-label">Amount in words:</div><div class="field-value">{{amountInWords}}</div></div>
        <div class="field-row download-row"><div class="field-label download-label">Receipt Download Date:</div><div class="field-value">{{receiptDownloadDate}}</div></div>
      </div>
    </div>
  </div>
</body>
</html>`;

const templateCache = new Map();
let cachedLogoDataUri = '';
let logoLookupAttempted = false;

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');

const padNumber = (value) => String(value).padStart(2, '0');

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return `${padNumber(date.getDate())}/${padNumber(date.getMonth() + 1)}/${date.getFullYear()}`;
};

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  let hours = date.getHours();
  const meridian = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  return `${formatDate(date)} ${padNumber(hours)}:${padNumber(date.getMinutes())} ${meridian}`;
};

const formatAmount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 'INR 0';
  }

  return `INR ${numeric.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
    maximumFractionDigits: 2
  })}`;
};

const toSafeLabelValue = (value, fallback = '-') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const normalizePaymentMethod = (value) => {
  const text = toSafeLabelValue(value, 'UNKNOWN');
  return text.replace(/[_\s]+/g, ' ').trim().toUpperCase();
};

const normalizePaymentStatus = (value) => {
  const normalized = toSafeLabelValue(value, 'PENDING').toUpperCase();

  if (['SUCCESS', 'PAID', 'VERIFIED'].includes(normalized)) {
    return 'PAID';
  }

  if (normalized === 'PENDING_VERIFICATION') {
    return 'PENDING VERIFICATION';
  }

  if (['FAILED', 'CANCELLED', 'REJECTED'].includes(normalized)) {
    return 'FAILED';
  }

  return normalized;
};

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

const toSafeFileToken = (value) => {
  const text = String(value || '').trim();
  if (!text) {
    return 'Receipt';
  }

  return text.replace(/[^A-Za-z0-9_-]/g, '_');
};

const buildStudentReceiptFileName = (receiptNumber) => `Fee_Receipt_${toSafeFileToken(receiptNumber)}.pdf`;
const buildTeacherReceiptFileName = (receiptNumber) => `Salary_Receipt_${toSafeFileToken(receiptNumber)}.pdf`;
const buildReceiptFileName = buildStudentReceiptFileName;

const resolveStudentReceiptNumber = ({ payment, receipt }) => {
  if (receipt?.receiptNumber) {
    return receipt.receiptNumber;
  }

  const transactionId = String(payment?.transactionId || '').trim();
  if (transactionId) {
    return `FEE-${transactionId}`;
  }

  return `FEE-${String(payment?._id || '').slice(-10) || Date.now()}`;
};

const resolveTeacherReceiptNumber = ({ payroll, receipt }) => {
  if (receipt?.receiptNumber) {
    return receipt.receiptNumber;
  }

  const monthToken = String(payroll?.month || '').replace(/[^0-9-]/g, '').trim();
  if (monthToken) {
    return `SAL-${monthToken}-${String(payroll?._id || '').slice(-6)}`;
  }

  return `SAL-${String(payroll?._id || '').slice(-10) || Date.now()}`;
};

const resolveMimeType = (filePath) => {
  const extension = String(path.extname(filePath) || '').toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }
  if (extension === '.webp') {
    return 'image/webp';
  }
  if (extension === '.svg') {
    return 'image/svg+xml';
  }

  return 'image/png';
};

const getLogoDataUri = async () => {
  if (logoLookupAttempted) {
    return cachedLogoDataUri;
  }

  logoLookupAttempted = true;

  try {
    const fileBuffer = await fs.readFile(LOGO_FILE_PATH);
    const mimeType = resolveMimeType(LOGO_FILE_PATH);
    cachedLogoDataUri = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
  } catch (_error) {
    cachedLogoDataUri = '';
  }

  return cachedLogoDataUri;
};

const resolveTemplateAbsolutePath = (fileName) => {
  const processCwdTemplatePath = path.join(process.cwd(), 'templates', fileName);
  const serviceRelativeTemplatePath = path.resolve(__dirname, '..', '..', 'templates', fileName);

  return [processCwdTemplatePath, serviceRelativeTemplatePath];
};

const readTemplateFile = async (fileName, inlineFallback) => {
  if (templateCache.has(fileName)) {
    return templateCache.get(fileName);
  }

  const candidates = resolveTemplateAbsolutePath(fileName);
  for (const templatePath of candidates) {
    try {
      const template = await fs.readFile(templatePath, 'utf8');
      templateCache.set(fileName, template);
      return template;
    } catch (_error) {
      // Continue trying candidate paths.
    }
  }

  console.error('[receipt-pdf] Could not read template file, using inline fallback:', fileName);
  templateCache.set(fileName, inlineFallback);
  return inlineFallback;
};

const renderHtmlTemplate = (template, model) =>
  String(template || '').replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    if (key === 'logoMarkup' || key === 'watermarkMarkup') {
      return String(model[key] || '');
    }

    return escapeHtml(model[key] ?? '');
  });

const getCommonSchoolModel = () => ({
  schoolName: toSafeLabelValue(SCHOOL_BRANCH_NAME || SCHOOL_NAME, SCHOOL_NAME).toUpperCase(),
  schoolAddress: toSafeLabelValue(SCHOOL_ADDRESS),
  schoolMobile: toSafeLabelValue(SCHOOL_MOBILE)
});

const buildStudentReceiptViewModel = ({ payment, student, classRecord, receipt }) => {
  const paymentAmount = Number(payment?.amount || receipt?.amount || 0);
  const studentName = student?.userId?.name || receipt?.studentName || 'Student';

  return {
    ...getCommonSchoolModel(),
    receiptNumber: resolveStudentReceiptNumber({ payment, receipt }),
    studentName,
    studentId: toSafeLabelValue(student?.admissionNo || student?._id),
    className: toSafeLabelValue(classRecord?.name || student?.classId?.name || receipt?.className),
    section: toSafeLabelValue(classRecord?.section || student?.classId?.section || '-'),
    amountPaid: formatAmount(paymentAmount),
    paymentFor: buildPaymentForLabel(payment),
    paymentMethod: normalizePaymentMethod(payment?.paymentMethod || receipt?.paymentMethod),
    paymentDateTime: formatDateTime(payment?.paidAt || payment?.verifiedAt || payment?.createdAt || receipt?.paymentDate),
    status: normalizePaymentStatus(payment?.paymentStatus || receipt?.status),
    amountInWords: amountToWordsINR(paymentAmount),
    receiptDownloadDate: formatDate(new Date())
  };
};

const buildTeacherReceiptViewModel = ({ payroll, teacher, receipt }) => {
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

  return {
    ...getCommonSchoolModel(),
    receiptNumber: resolveTeacherReceiptNumber({ payroll, receipt }),
    teacherName: toSafeLabelValue(teacher?.userId?.name || receipt?.teacherName || 'Teacher'),
    teacherId: toSafeLabelValue(teacher?.teacherId || teacher?._id),
    payrollMonth: toSafeLabelValue(payroll?.month || '-', '-'),
    monthlySalary: formatAmount(monthlySalary),
    amountPaid: formatAmount(amountPaid),
    pendingSalary: formatAmount(pendingSalary),
    paymentMethod: normalizePaymentMethod(receipt?.paymentMethod || payroll?.paymentMethod),
    paymentDateTime: formatDateTime(receipt?.paymentDate || payroll?.paidOn || payroll?.updatedAt),
    status: normalizePaymentStatus(receipt?.status || payroll?.status || 'PAID'),
    amountInWords: amountToWordsINR(amountPaid),
    receiptDownloadDate: formatDate(new Date())
  };
};

const getTemplateModelWithLogo = async (model) => {
  const logoDataUri = await getLogoDataUri();

  return {
    ...model,
    logoMarkup: logoDataUri
      ? `<img class="school-logo" src="${logoDataUri}" alt="School Logo" />`
      : '',
    watermarkMarkup: logoDataUri ? `<img src="${logoDataUri}" alt="" />` : ''
  };
};

const getChromiumExecutablePath = async () => {
  const envPath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.CHROME_EXECUTABLE_PATH ||
    process.env.GOOGLE_CHROME_BIN;

  if (envPath) {
    return envPath;
  }

  if (typeof chromium.executablePath === 'function') {
    return chromium.executablePath();
  }

  return String(chromium.executablePath || '').trim();
};

const launchReceiptBrowser = async () => {
  const executablePath = await getChromiumExecutablePath();
  if (!executablePath) {
    throw new Error('Chromium executable path could not be resolved');
  }

  const args = Array.isArray(chromium.args) && chromium.args.length > 0
    ? chromium.args
    : ['--no-sandbox', '--disable-setuid-sandbox'];

  return puppeteer.launch({
    args,
    executablePath,
    headless: typeof chromium.headless === 'boolean' ? chromium.headless : true,
    defaultViewport: chromium.defaultViewport || DEFAULT_VIEWPORT
  });
};

const buildFallbackPdfBuffer = async ({ title, model, fields }) =>
  new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];

    document.on('data', (chunk) => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));

    document
      .fontSize(22)
      .fillColor('#132a56')
      .text(title, { align: 'center' });

    document
      .moveDown(0.6)
      .fontSize(12)
      .fillColor('#111827')
      .text(model.schoolName, { align: 'center' })
      .fontSize(10)
      .text(`Address: ${model.schoolAddress}`, { align: 'center' })
      .text(`Mob.: ${model.schoolMobile}`, { align: 'center' });

    document.moveDown(1.2);

    fields.forEach(([label, value]) => {
      document
        .fontSize(10)
        .fillColor('#334155')
        .text(`${label}:`, { continued: true })
        .fillColor('#0f172a')
        .text(` ${toSafeLabelValue(value)}`)
        .moveDown(0.25);
    });

    document.end();
  });

const buildFallbackStudentReceiptPdfBuffer = async (model) =>
  buildFallbackPdfBuffer({
    title: 'FEE PAYMENT RECEIPT',
    model,
    fields: [
      ['Receipt Number', model.receiptNumber],
      ['Student Name', model.studentName],
      ['Student ID', model.studentId],
      ['Class', `${model.className} | Sec: ${model.section}`],
      ['Amount Paid', model.amountPaid],
      ['Payment For', model.paymentFor],
      ['Payment Method', model.paymentMethod],
      ['Payment Date and Time', model.paymentDateTime],
      ['Status', model.status],
      ['Amount in words', model.amountInWords],
      ['Receipt Download Date', model.receiptDownloadDate]
    ]
  });

const buildFallbackTeacherReceiptPdfBuffer = async (model) =>
  buildFallbackPdfBuffer({
    title: 'SALARY PAYMENT RECEIPT',
    model,
    fields: [
      ['Receipt Number', model.receiptNumber],
      ['Teacher Name', model.teacherName],
      ['Teacher ID', model.teacherId],
      ['Payroll Month', model.payrollMonth],
      ['Monthly Salary', model.monthlySalary],
      ['Amount Paid', model.amountPaid],
      ['Pending Salary', model.pendingSalary],
      ['Payment Method', model.paymentMethod],
      ['Payment Date and Time', model.paymentDateTime],
      ['Status', model.status],
      ['Amount in words', model.amountInWords],
      ['Receipt Download Date', model.receiptDownloadDate]
    ]
  });

const generatePdfBufferUsingPuppeteer = async (html) => {
  console.log('[receipt-pdf] Launching browser');
  const browser = await launchReceiptBrowser();

  try {
    const page = await browser.newPage();
    await page.setViewport(DEFAULT_VIEWPORT);
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 45000 });

    console.log('[receipt-pdf] Generating PDF');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: PDF_MARGIN,
      preferCSSPageSize: true
    });

    return Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer || []);
  } finally {
    await browser.close().catch(() => {});
  }
};

const createStudentFeeReceiptPdf = async ({ payment, student, classRecord, receipt }) => {
  console.log('[receipt-pdf] Building student receipt model');
  const model = buildStudentReceiptViewModel({ payment, student, classRecord, receipt });

  const template = await readTemplateFile(STUDENT_TEMPLATE_FILE, DEFAULT_STUDENT_TEMPLATE);
  const templateModel = await getTemplateModelWithLogo(model);

  console.log('[receipt-pdf] Generating HTML');
  const html = renderHtmlTemplate(template, templateModel);

  const toResult = (pdfBuffer, generator) => ({
    pdfBuffer,
    receiptNumber: model.receiptNumber,
    fileName: buildStudentReceiptFileName(model.receiptNumber),
    generator
  });

  try {
    const pdfBuffer = await generatePdfBufferUsingPuppeteer(html);
    return toResult(pdfBuffer, 'puppeteer-core+chromium');
  } catch (error) {
    console.error('[receipt-pdf] Chromium generation failed, using PDFKit fallback:', error?.message || error);
    const fallbackBuffer = await buildFallbackStudentReceiptPdfBuffer(model);
    return toResult(fallbackBuffer, 'pdfkit');
  }
};

const createTeacherSalaryReceiptPdf = async ({ payroll, teacher, receipt }) => {
  console.log('[receipt-pdf] Building teacher receipt model');
  const model = buildTeacherReceiptViewModel({ payroll, teacher, receipt });

  const template = await readTemplateFile(TEACHER_TEMPLATE_FILE, DEFAULT_TEACHER_TEMPLATE);
  const templateModel = await getTemplateModelWithLogo(model);

  console.log('[receipt-pdf] Generating HTML');
  const html = renderHtmlTemplate(template, templateModel);

  const toResult = (pdfBuffer, generator) => ({
    pdfBuffer,
    receiptNumber: model.receiptNumber,
    fileName: buildTeacherReceiptFileName(model.receiptNumber),
    generator
  });

  try {
    const pdfBuffer = await generatePdfBufferUsingPuppeteer(html);
    return toResult(pdfBuffer, 'puppeteer-core+chromium');
  } catch (error) {
    console.error('[receipt-pdf] Chromium generation failed, using PDFKit fallback:', error?.message || error);
    const fallbackBuffer = await buildFallbackTeacherReceiptPdfBuffer(model);
    return toResult(fallbackBuffer, 'pdfkit');
  }
};

const createStudentFeeReceiptFallbackPdf = async ({ payment, student, classRecord, receipt }) => {
  const model = buildStudentReceiptViewModel({ payment, student, classRecord, receipt });
  const pdfBuffer = await buildFallbackStudentReceiptPdfBuffer(model);

  return {
    pdfBuffer,
    receiptNumber: model.receiptNumber,
    fileName: buildStudentReceiptFileName(model.receiptNumber),
    generator: 'pdfkit'
  };
};

const createTeacherSalaryReceiptFallbackPdf = async ({ payroll, teacher, receipt }) => {
  const model = buildTeacherReceiptViewModel({ payroll, teacher, receipt });
  const pdfBuffer = await buildFallbackTeacherReceiptPdfBuffer(model);

  return {
    pdfBuffer,
    receiptNumber: model.receiptNumber,
    fileName: buildTeacherReceiptFileName(model.receiptNumber),
    generator: 'pdfkit'
  };
};

module.exports = {
  createStudentFeeReceiptPdf,
  createStudentFeeReceiptFallbackPdf,
  createTeacherSalaryReceiptPdf,
  createTeacherSalaryReceiptFallbackPdf,
  buildStudentReceiptFileName,
  buildTeacherReceiptFileName,
  buildReceiptFileName
};
