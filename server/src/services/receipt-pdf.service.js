const PDFDocument = require('pdfkit');

const { amountToWordsINR } = require('../utils/amount-in-words');
const {
  SCHOOL_NAME,
  SCHOOL_BRANCH_NAME,
  SCHOOL_ADDRESS,
  SCHOOL_MOBILE
} = require('../config/school');

const SUCCESSFUL_PAYMENT_STATUSES = new Set(['SUCCESS', 'PAID', 'VERIFIED']);

const toSafeText = (value, fallback = '-') => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

const toSafeFileToken = (value, fallback = 'Receipt') => {
  const normalized = toSafeText(value, fallback);
  return normalized.replace(/[^A-Za-z0-9_-]/g, '_');
};

const toCurrency = (value) => {
  const numeric = Number(value);
  const normalized = Number.isFinite(numeric) ? Math.max(numeric, 0) : 0;

  return `INR ${normalized.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const padNumber = (value) => String(value).padStart(2, '0');

const toDateTime = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  let hours = parsed.getHours();
  const meridian = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  return `${padNumber(parsed.getDate())}/${padNumber(parsed.getMonth() + 1)}/${parsed.getFullYear()} ${padNumber(hours)}:${padNumber(parsed.getMinutes())} ${meridian}`;
};

const normalizePaymentStatus = (value) => {
  const normalized = String(value || '').trim().toUpperCase();

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

const resolveReceiptNumber = ({ payment, receipt }) => {
  const existingReceiptNumber = String(receipt?.receiptNumber || '').trim();
  if (existingReceiptNumber) {
    return existingReceiptNumber;
  }

  const transactionId = String(payment?.transactionId || '').trim();
  if (transactionId) {
    return `FEE-${transactionId}`;
  }

  const paymentIdToken = String(payment?._id || '').slice(-10);
  return `FEE-${paymentIdToken || Date.now()}`;
};

const collectPdfBuffer = (doc) =>
  new Promise((resolve, reject) => {
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

const drawKeyValueRow = (doc, label, value) => {
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#1f2937')
    .text(`${label}: `, {
      continued: true,
      width: 520,
      lineGap: 2
    });

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#111827')
    .text(toSafeText(value), {
      width: 520,
      lineGap: 2
    });
};

const drawSectionHeading = (doc, title) => {
  doc.moveDown(0.8);
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#0f172a')
    .text(title, {
      underline: true
    });
  doc.moveDown(0.4);
};

const buildViewModel = ({ payment, student, receipt }) => {
  const className = toSafeText(student?.classId?.name || receipt?.className);
  const sectionName = toSafeText(student?.classId?.section || '-');
  const amountPaid = Number(payment?.amount || receipt?.amount || 0);
  const paymentDateTime = payment?.paidAt || payment?.verifiedAt || payment?.updatedAt || payment?.createdAt || receipt?.paymentDate;
  const transactionReference = payment?.providerReferenceId || payment?.transactionId || receipt?.transactionReference;

  return {
    receiptNumber: resolveReceiptNumber({ payment, receipt }),
    schoolName: toSafeText(SCHOOL_BRANCH_NAME || SCHOOL_NAME, SCHOOL_NAME),
    schoolAddress: toSafeText(SCHOOL_ADDRESS),
    schoolMobile: toSafeText(SCHOOL_MOBILE),
    studentName: toSafeText(student?.userId?.name || receipt?.studentName, 'Student'),
    studentId: toSafeText(student?.admissionNo || student?._id),
    classLabel: sectionName === '-' ? className : `${className} (${sectionName})`,
    paymentId: toSafeText(payment?._id),
    transactionId: toSafeText(payment?.transactionId),
    transactionReference: toSafeText(transactionReference),
    paymentFor: buildPaymentForLabel(payment),
    paymentMethod: normalizePaymentMethod(payment?.paymentMethod || receipt?.paymentMethod),
    paymentStatus: normalizePaymentStatus(payment?.paymentStatus || receipt?.status),
    paymentDateTime: toDateTime(paymentDateTime),
    amountPaid,
    amountPaidFormatted: toCurrency(amountPaid),
    amountInWords: amountToWordsINR(amountPaid),
    remainingBalanceFormatted: toCurrency(payment?.remainingBalance || 0),
    processedBy: toSafeText(payment?.processedByAdmin?.name || payment?.processedBy || '-'),
    generatedAt: toDateTime(new Date())
  };
};

const createDynamicStudentReceiptPdf = async ({ payment, student, receipt }) => {
  const model = buildViewModel({ payment, student, receipt });
  const document = new PDFDocument({
    size: 'A4',
    margin: 46,
    info: {
      Title: `Fee Receipt ${model.receiptNumber}`,
      Author: model.schoolName,
      Subject: 'Student Fee Payment Receipt'
    }
  });

  const pdfBufferPromise = collectPdfBuffer(document);

  document
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor('#111827')
    .text('FEE PAYMENT RECEIPT', { align: 'center' });

  document.moveDown(0.4);
  document
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#0f172a')
    .text(model.schoolName, { align: 'center' });

  document
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#1f2937')
    .text(model.schoolAddress, { align: 'center' });

  document
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#1f2937')
    .text(`Contact: ${model.schoolMobile}`, { align: 'center' });

  document.moveDown(1);
  drawSectionHeading(document, 'Receipt Details');
  drawKeyValueRow(document, 'Receipt Number', model.receiptNumber);
  drawKeyValueRow(document, 'Payment ID', model.paymentId);
  drawKeyValueRow(document, 'Transaction ID', model.transactionId);
  drawKeyValueRow(document, 'Transaction Reference', model.transactionReference);
  drawKeyValueRow(document, 'Payment For', model.paymentFor);

  drawSectionHeading(document, 'Student Details');
  drawKeyValueRow(document, 'Student Name', model.studentName);
  drawKeyValueRow(document, 'Student ID', model.studentId);
  drawKeyValueRow(document, 'Class', model.classLabel);

  drawSectionHeading(document, 'Payment Summary');
  drawKeyValueRow(document, 'Amount Paid', model.amountPaidFormatted);
  drawKeyValueRow(document, 'Amount in Words', model.amountInWords);
  drawKeyValueRow(document, 'Payment Method', model.paymentMethod);
  drawKeyValueRow(document, 'Payment Date and Time', model.paymentDateTime);
  drawKeyValueRow(document, 'Payment Status', model.paymentStatus);
  drawKeyValueRow(document, 'Remaining Balance', model.remainingBalanceFormatted);
  drawKeyValueRow(document, 'Processed By', model.processedBy);

  document.moveDown(1.4);
  drawKeyValueRow(document, 'Receipt Download Date', model.generatedAt);

  document
    .moveDown(1.8)
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#475569')
    .text('This is a system-generated receipt and does not require a signature.', {
      align: 'left'
    });

  document.end();

  const pdfBuffer = await pdfBufferPromise;

  return {
    pdfBuffer,
    fileName: `Fee_Receipt_${toSafeFileToken(model.receiptNumber)}.pdf`,
    generator: 'pdfkit-dynamic-v1'
  };
};

module.exports = {
  createDynamicStudentReceiptPdf
};
