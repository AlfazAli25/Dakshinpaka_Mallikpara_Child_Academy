const fs = require('fs/promises');
const path = require('path');
const puppeteerCore = require('puppeteer-core');
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

let cachedLogoDataUri = '';
let logoLookupAttempted = false;
const isServerlessRuntime = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT
);
const isProductionEnvironment = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const allowBrowserPdfInProduction =
  String(process.env.RECEIPT_ENABLE_BROWSER_PDF || '').toLowerCase() === 'true';

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

const buildReceiptFileName = (receiptNumber) => `Fee_Receipt_${toSafeFileToken(receiptNumber)}.pdf`;

const resolveReceiptNumber = ({ payment, receipt }) => {
  if (receipt?.receiptNumber) {
    return receipt.receiptNumber;
  }

  const transactionId = String(payment?.transactionId || '').trim();
  if (transactionId) {
    return `FEE-${transactionId}`;
  }

  return `FEE-${String(payment?._id || '').slice(-10) || Date.now()}`;
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

const buildStudentReceiptViewModel = ({ payment, student, classRecord, receipt }) => {
  const paymentAmount = Number(payment?.amount || receipt?.amount || 0);
  const studentName =
    student?.userId?.name ||
    receipt?.studentName ||
    'Student';

  return {
    schoolName: toSafeLabelValue(SCHOOL_BRANCH_NAME || SCHOOL_NAME, SCHOOL_NAME).toUpperCase(),
    schoolAddress: toSafeLabelValue(SCHOOL_ADDRESS),
    schoolMobile: toSafeLabelValue(SCHOOL_MOBILE),
    receiptNumber: resolveReceiptNumber({ payment, receipt }),
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

const buildStudentReceiptHtml = ({ model, logoDataUri }) => {
  const logoMarkup = logoDataUri
    ? `<img class="school-logo" src="${logoDataUri}" alt="School Logo" />`
    : '';
  const watermarkMarkup = logoDataUri
    ? `<img src="${logoDataUri}" alt="" />`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      @page {
        size: A4;
        margin: 0;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #0f172a;
        font-family: Arial, Helvetica, sans-serif;
      }

      .receipt-page {
        position: relative;
        width: 210mm;
        min-height: 297mm;
        padding: 14mm 13mm 12mm;
        overflow: hidden;
      }

      .watermark {
        position: absolute;
        inset: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        pointer-events: none;
        z-index: 0;
      }

      .watermark img {
        width: 146mm;
        opacity: 0.085;
        transform: translateY(14mm);
      }

      .content {
        position: relative;
        z-index: 1;
      }

      .school-logo {
        display: block;
        width: 56mm;
        margin: 0 auto 2mm;
      }

      .receipt-title {
        margin: 0 0 2.5mm;
        text-align: center;
        color: #132a56;
        font-size: 13mm;
        font-weight: 900;
        letter-spacing: 0.3mm;
      }

      .school-details {
        width: fit-content;
        max-width: 100%;
        margin: 0 auto 7mm;
        border: 0.4mm solid #111827;
        border-radius: 2.3mm;
        padding: 2.1mm 2.8mm;
        background: rgba(255, 255, 255, 0.92);
      }

      .school-details-name {
        font-size: 5.2mm;
        font-weight: 800;
        text-transform: uppercase;
        line-height: 1.2;
      }

      .school-details-meta {
        font-size: 4.2mm;
        font-weight: 600;
        line-height: 1.35;
      }

      .fields {
        margin-top: 1mm;
      }

      .field-row {
        display: grid;
        grid-template-columns: 45mm 1fr;
        column-gap: 3.5mm;
        align-items: center;
        margin-bottom: 2.4mm;
      }

      .field-row.class-row {
        grid-template-columns: 45mm 1fr 11mm 30mm;
      }

      .field-row.spacer-top {
        margin-top: 6.4mm;
      }

      .field-row.download-row {
        margin-top: 2mm;
        grid-template-columns: 45mm 68mm;
      }

      .field-label {
        font-size: 4.6mm;
        font-weight: 700;
        color: #121826;
      }

      .field-label.download-label {
        font-size: 5mm;
        font-weight: 900;
        color: #132a56;
      }

      .small-label {
        text-align: right;
        font-size: 4.6mm;
        font-weight: 700;
        color: #121826;
      }

      .field-value {
        height: 9.2mm;
        border-radius: 2mm;
        background: #e8ebf4;
        padding: 0 3mm;
        display: flex;
        align-items: center;
        font-size: 4.2mm;
        font-weight: 600;
        color: #111827;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    </style>
  </head>
  <body>
    <div class="receipt-page">
      <div class="watermark">${watermarkMarkup}</div>

      <div class="content">
        ${logoMarkup}

        <h1 class="receipt-title">FEE PAYMENT RECEIPT</h1>

        <div class="school-details">
          <div class="school-details-name">${escapeHtml(model.schoolName)}</div>
          <div class="school-details-meta">Address: ${escapeHtml(model.schoolAddress)}</div>
          <div class="school-details-meta">Mob.: ${escapeHtml(model.schoolMobile)}</div>
        </div>

        <div class="fields">
          <div class="field-row">
            <div class="field-label">Receipt Number:</div>
            <div class="field-value">${escapeHtml(model.receiptNumber)}</div>
          </div>

          <div class="field-row">
            <div class="field-label">Student Name:</div>
            <div class="field-value">${escapeHtml(model.studentName)}</div>
          </div>

          <div class="field-row">
            <div class="field-label">Student ID:</div>
            <div class="field-value">${escapeHtml(model.studentId)}</div>
          </div>

          <div class="field-row class-row">
            <div class="field-label">Class:</div>
            <div class="field-value">${escapeHtml(model.className)}</div>
            <div class="small-label">Sec:</div>
            <div class="field-value">${escapeHtml(model.section)}</div>
          </div>

          <div class="field-row">
            <div class="field-label">Amount Paid:</div>
            <div class="field-value">${escapeHtml(model.amountPaid)}</div>
          </div>

          <div class="field-row">
            <div class="field-label">Payment For:</div>
            <div class="field-value">${escapeHtml(model.paymentFor)}</div>
          </div>

          <div class="field-row">
            <div class="field-label">Payment Method:</div>
            <div class="field-value">${escapeHtml(model.paymentMethod)}</div>
          </div>

          <div class="field-row">
            <div class="field-label">Payment Date and Time:</div>
            <div class="field-value">${escapeHtml(model.paymentDateTime)}</div>
          </div>

          <div class="field-row">
            <div class="field-label">Status:</div>
            <div class="field-value">${escapeHtml(model.status)}</div>
          </div>

          <div class="field-row spacer-top">
            <div class="field-label">Amount in words:</div>
            <div class="field-value">${escapeHtml(model.amountInWords)}</div>
          </div>

          <div class="field-row download-row">
            <div class="field-label download-label">Receipt Download Date:</div>
            <div class="field-value">${escapeHtml(model.receiptDownloadDate)}</div>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
};

const getPuppeteerLaunchOptions = () => {
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  return launchOptions;
};

const getServerlessLaunchOptions = async () => {
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    (typeof chromium.executablePath === 'function' ? await chromium.executablePath() : '');

  if (!executablePath) {
    return null;
  }

  const chromiumArgs = Array.isArray(chromium.args) ? chromium.args : [];

  return {
    executablePath,
    headless: true,
    args: [...new Set([...chromiumArgs, '--no-sandbox', '--disable-setuid-sandbox'])],
    defaultViewport: chromium.defaultViewport || { width: 1240, height: 1754, deviceScaleFactor: 2 }
  };
};

const launchReceiptBrowser = async () => {
  if (isServerlessRuntime) {
    const serverlessLaunchOptions = await getServerlessLaunchOptions();
    if (serverlessLaunchOptions) {
      return puppeteerCore.launch(serverlessLaunchOptions);
    }

    return null;
  }

  const puppeteer = require('puppeteer');
  return puppeteer.launch(getPuppeteerLaunchOptions());
};

const buildFallbackStudentReceiptPdfBuffer = async (model) =>
  new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];

    document.on('data', (chunk) => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));

    document
      .fontSize(22)
      .fillColor('#132a56')
      .text('FEE PAYMENT RECEIPT', { align: 'center' });

    document
      .moveDown(0.6)
      .fontSize(12)
      .fillColor('#111827')
      .text(model.schoolName, { align: 'center' })
      .fontSize(10)
      .text(`Address: ${model.schoolAddress}`, { align: 'center' })
      .text(`Mob.: ${model.schoolMobile}`, { align: 'center' });

    document.moveDown(1.2);

    const fields = [
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
    ];

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

const createStudentFeeReceiptPdf = async ({ payment, student, classRecord, receipt }) => {
  const model = buildStudentReceiptViewModel({ payment, student, classRecord, receipt });
  const logoDataUri = await getLogoDataUri();
  const html = buildStudentReceiptHtml({ model, logoDataUri });

  const toResult = (pdfBuffer) => ({
    pdfBuffer,
    receiptNumber: model.receiptNumber,
    fileName: buildReceiptFileName(model.receiptNumber)
  });

  const buildFallbackResult = async () => {
    const fallbackBuffer = await buildFallbackStudentReceiptPdfBuffer(model);
    return toResult(fallbackBuffer);
  };

  const shouldForceFallback =
    isServerlessRuntime ||
    (isProductionEnvironment && !allowBrowserPdfInProduction);

  if (shouldForceFallback) {
    return buildFallbackResult();
  }

  let browser;
  try {
    browser = await launchReceiptBrowser();
    if (!browser) {
      return buildFallbackResult();
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 45000 });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: PDF_MARGIN,
      preferCSSPageSize: true
    });

    return toResult(pdfBuffer);
  } catch (error) {
    console.error('[receipt-pdf] Chromium generation failed, using fallback PDF:', error?.message || error);
    return buildFallbackResult();
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
};

const createStudentFeeReceiptFallbackPdf = async ({ payment, student, classRecord, receipt }) => {
  const model = buildStudentReceiptViewModel({ payment, student, classRecord, receipt });
  const pdfBuffer = await buildFallbackStudentReceiptPdfBuffer(model);

  return {
    pdfBuffer,
    receiptNumber: model.receiptNumber,
    fileName: buildReceiptFileName(model.receiptNumber)
  };
};

module.exports = {
  createStudentFeeReceiptPdf,
  createStudentFeeReceiptFallbackPdf,
  buildReceiptFileName
};
