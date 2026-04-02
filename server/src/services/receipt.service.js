const Receipt = require('../models/receipt.model');

const randomSuffix = () => Math.floor(Math.random() * 1000000).toString().padStart(6, '0');

const buildReceiptNumber = (prefix) => `${prefix}-${Date.now()}-${randomSuffix()}`;

const createFeeReceipt = async ({ student, fee, payment, amount, paymentMethod, transactionReference, generatedBy }) => {
  const existing = payment?._id ? await Receipt.findOne({ paymentId: payment._id }) : null;
  if (existing) {
    return existing;
  }

  return Receipt.create({
    receiptNumber: buildReceiptNumber('FEE'),
    receiptType: 'FEE',
    studentId: student?._id,
    feeId: fee?._id,
    paymentId: payment?._id,
    generatedBy,
    studentName: student?.userId?.name || student?.name || 'Student',
    className: student?.classId?.name || '',
    amount,
    paymentMethod,
    paymentDate: payment?.paidAt || fee?.paymentDate || new Date(),
    transactionReference: transactionReference || payment?.providerReferenceId || payment?.transactionId,
    status: 'PAID'
  });
};

const createSalaryReceipt = async ({ teacher, payroll, amount, paymentMethod, generatedBy, pendingSalaryCleared }) => {
  const existing = payroll?.receiptId ? await Receipt.findById(payroll.receiptId) : null;
  if (existing) {
    return existing;
  }

  return Receipt.create({
    receiptNumber: buildReceiptNumber('SAL'),
    receiptType: 'SALARY',
    teacherId: teacher?._id,
    payrollId: payroll?._id,
    generatedBy,
    teacherName: teacher?.userId?.name || 'Teacher',
    amount,
    paymentMethod,
    paymentDate: payroll?.paidOn || new Date(),
    transactionReference: payroll?._id ? `PAYROLL-${payroll._id}` : undefined,
    status: 'PAID',
    pendingSalaryCleared
  });
};

const findStudentReceipts = async (studentId) =>
  Receipt.find({ studentId, receiptType: 'FEE' }).sort({ createdAt: -1 });

const findTeacherReceipts = async (teacherId) =>
  Receipt.find({ teacherId, receiptType: 'SALARY' }).sort({ createdAt: -1 });

module.exports = {
  createFeeReceipt,
  createSalaryReceipt,
  findStudentReceipts,
  findTeacherReceipts
};
