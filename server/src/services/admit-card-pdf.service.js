const PDFDocument = require('pdfkit');

const {
  SCHOOL_NAME,
  SCHOOL_ADDRESS,
  SCHOOL_MOBILE
} = require('../config/school');

const padNumber = (value) => String(value).padStart(2, '0');

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
    return '-';
  }

  return `${padNumber(parsed.getDate())}/${padNumber(parsed.getMonth() + 1)}/${parsed.getFullYear()}`;
};

const formatTime = (value) => {
  const parsed = toDate(value);
  if (!parsed) {
    return '-';
  }

  let hours = parsed.getHours();
  const meridian = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  return `${padNumber(hours)}:${padNumber(parsed.getMinutes())} ${meridian}`;
};

const toSafeText = (value, fallback = '-') => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

const toSafeFileToken = (value, fallback = 'AdmitCard') =>
  toSafeText(value, fallback).replace(/[^A-Za-z0-9_-]/g, '_');

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

const createAdmitCardPdf = async ({ admitCard = {}, exam = {}, student = {} }) => {
  const studentName = toSafeText(student?.userId?.name, 'Student');
  const studentAdmissionNo = toSafeText(student?.admissionNo, '-');
  const studentRollNo = toSafeText(student?.rollNo, '-');
  const className = toSafeText(student?.classId?.name || admitCard?.classId?.name, '-');
  const sectionName = toSafeText(student?.classId?.section || admitCard?.classId?.section, '-');

  const examName = toSafeText(admitCard?.examName || exam?.examName, 'Exam');
  const academicYear = toSafeText(admitCard?.academicYear || exam?.academicYear, '-');
  const examStartDate = admitCard?.examStartDate || exam?.startDate || exam?.date || exam?.examDate;
  const examEndDate = admitCard?.examEndDate || exam?.endDate || examStartDate;

  const scheduleRows = getScheduleRows(admitCard, exam);

  const pdfBuffer = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(18).text(String(SCHOOL_NAME || '').toUpperCase(), { align: 'center' });
    doc.moveDown(0.1);
    doc.font('Helvetica').fontSize(10).text(`Address: ${toSafeText(SCHOOL_ADDRESS)}`, { align: 'center' });
    doc.moveDown(0.1);
    doc.font('Helvetica').fontSize(10).text(`Contact: ${toSafeText(SCHOOL_MOBILE)}`, { align: 'center' });

    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(20).text('ADMIT CARD', { align: 'center' });
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(12).text(examName, { align: 'center' });

    doc.moveDown(1.1);
    doc.font('Helvetica-Bold').fontSize(11).text('Student Details');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(11);
    doc.text(`Name: ${studentName}`);
    doc.text(`Admission No: ${studentAdmissionNo}`);
    doc.text(`Roll No: ${studentRollNo}`);
    doc.text(`Class: ${className} | Section: ${sectionName}`);

    doc.moveDown(0.9);
    doc.font('Helvetica-Bold').fontSize(11).text('Exam Summary');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(11);
    doc.text(`Academic Year: ${academicYear}`);
    doc.text(`Exam Window: ${formatDate(examStartDate)} - ${formatDate(examEndDate)}`);
    doc.text(`Issue Date: ${formatDate(new Date())}`);

    doc.moveDown(0.9);
    doc.font('Helvetica-Bold').fontSize(11).text('Subject Schedule');
    doc.moveDown(0.35);

    if (scheduleRows.length === 0) {
      doc.font('Helvetica').fontSize(10).text('Subject schedule will be announced soon.');
    } else {
      scheduleRows.forEach((row, index) => {
        const subjectName = toSafeText(row?.subjectName, 'Subject');
        const dateLabel = formatDate(row?.startDate);
        const startTime = formatTime(row?.startDate);
        const endTime = formatTime(row?.endDate);

        doc.font('Helvetica-Bold').fontSize(10).text(`${index + 1}. ${subjectName}`);
        doc.font('Helvetica').fontSize(10).text(`   Date: ${dateLabel}`);
        doc.font('Helvetica').fontSize(10).text(`   Time: ${startTime} - ${endTime}`);
        doc.moveDown(0.25);
      });
    }

    doc.moveDown(1.5);
    doc.font('Helvetica').fontSize(9).fillColor('#4b5563').text(
      'Carry this admit card on exam days. Entry is allowed only for eligible students with fee clearance.',
      { align: 'left' }
    );

    doc.end();
  });

  return {
    pdfBuffer,
    fileName: `Admit_Card_${toSafeFileToken(studentAdmissionNo || studentName)}_${toSafeFileToken(examName)}.pdf`
  };
};

module.exports = {
  createAdmitCardPdf
};
