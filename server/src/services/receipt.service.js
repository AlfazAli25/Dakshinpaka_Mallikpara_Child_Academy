const Receipt = require('../models/receipt.model');

const randomSuffix = () => Math.floor(Math.random() * 1000000).toString().padStart(6, '0');

const buildReceiptNumber = (prefix) => `${prefix}-${Date.now()}-${randomSuffix()}`;

const normalizeAmount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return Number(numeric.toFixed(2));
};

const createFeeReceipt = async ({ student, fee, payment, amount, paymentMethod, transactionReference, generatedBy, session }) => {
  const existing = payment?._id ? await Receipt.findOne({ paymentId: payment._id }).session(session || null) : null;
  if (existing) {
    return existing;
  }

  const [receipt] = await Receipt.create([
    {
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
    }
  ], { session });

  return receipt;
};

const createSalaryReceipt = async ({
  teacher,
  payroll,
  amount,
  amountPaid,
  monthlySalary,
  pendingSalary,
  paymentMethod,
  generatedBy,
  pendingSalaryCleared,
  session
}) => {
  const normalizedAmountPaid = normalizeAmount(
    amountPaid !== undefined
      ? amountPaid
      : pendingSalaryCleared !== undefined
        ? pendingSalaryCleared
        : amount
  );
  const normalizedMonthlySalary = normalizeAmount(
    monthlySalary !== undefined ? monthlySalary : teacher?.monthlySalary
  );
  const normalizedPendingSalary = normalizeAmount(pendingSalary);
  const normalizedReceiptAmount = normalizeAmount(amount !== undefined ? amount : normalizedAmountPaid);

  const existing = payroll?.receiptId ? await Receipt.findById(payroll.receiptId).session(session || null) : null;
  if (existing) {
    existing.amount = normalizedReceiptAmount;
    existing.amountPaid = normalizedAmountPaid;
    existing.monthlySalary = normalizedMonthlySalary;
    existing.pendingSalary = normalizedPendingSalary;
    existing.paymentMethod = paymentMethod;
    existing.paymentDate = payroll?.paidOn || new Date();
    existing.pendingSalaryCleared = normalizedAmountPaid;
    existing.transactionReference = payroll?._id ? `PAYROLL-${payroll._id}` : existing.transactionReference;
    existing.status = 'PAID';
    if (generatedBy) {
      existing.generatedBy = generatedBy;
    }
    await existing.save({ session });
    return existing;
  }

  const [receipt] = await Receipt.create([
    {
    receiptNumber: buildReceiptNumber('SAL'),
    receiptType: 'SALARY',
    teacherId: teacher?._id,
    payrollId: payroll?._id,
    generatedBy,
    teacherName: teacher?.userId?.name || 'Teacher',
    amount: normalizedReceiptAmount,
    amountPaid: normalizedAmountPaid,
    monthlySalary: normalizedMonthlySalary,
    pendingSalary: normalizedPendingSalary,
    paymentMethod,
    paymentDate: payroll?.paidOn || new Date(),
    transactionReference: payroll?._id ? `PAYROLL-${payroll._id}` : undefined,
    status: 'PAID',
    pendingSalaryCleared: normalizedAmountPaid
    }
  ], { session });

  return receipt;
};

const createNoticeReceipt = async ({
  student,
  notice,
  noticePayment,
  amount,
  paymentMethod,
  transactionReference,
  generatedBy,
  session
}) => {
  const existing = noticePayment?._id ? await Receipt.findOne({ noticePaymentId: noticePayment._id }).session(session || null) : null;
  if (existing) {
    return existing;
  }

  let receipt;
  try {
    [receipt] = await Receipt.create([
      {
        receiptNumber: buildReceiptNumber('NOT'),
        receiptType: 'NOTICE',
        studentId: student?._id,
        noticeId: notice?._id,
        noticePaymentId: noticePayment?._id,
        generatedBy,
        studentName: student?.userId?.name || student?.name || 'Student',
        className: student?.classId?.name || '',
        noticeTitle: notice?.title || 'Notice Payment',
        amount,
        paymentMethod,
        paymentDate: noticePayment?.paymentDate || noticePayment?.verifiedAt || new Date(),
        transactionReference: transactionReference || noticePayment?.transactionReference,
        status: 'PAID'
      }
    ], { session });
  } catch (error) {
    if (Number(error?.code || 0) === 11000 && noticePayment?._id) {
      return Receipt.findOne({ noticePaymentId: noticePayment._id }).session(session || null);
    }

    throw error;
  }

  return receipt;
};

const findStudentReceipts = async (studentId) =>
  Receipt.find({ studentId, receiptType: { $in: ['FEE', 'NOTICE'] } }).sort({ createdAt: -1 });

const findTeacherReceipts = async (teacherId) =>
  Receipt.find({ teacherId, receiptType: 'SALARY' }).sort({ createdAt: -1 });

module.exports = {
  createFeeReceipt,
  createSalaryReceipt,
  createNoticeReceipt,
  findStudentReceipts,
  findTeacherReceipts
};
