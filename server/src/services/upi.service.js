const Payment = require('../models/payment.model');
const Student = require('../models/student.model');
const Fee = require('../models/fee.model');
const { URLSearchParams } = require('url');
const { createActionLog } = require('./action-log.service');

// UPI config (should be moved to config/env in production)
const UPI_ID = 'alfazali499-1@okicici';
const PAYEE_NAME = 'Dakshinpaka Mallikpara Child Academy';

function encodeURIComponentSafe(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16));
}

function buildUpiLink({ upiId, payeeName, amount, note }) {
  const params = new URLSearchParams();
  params.set('pa', upiId);
  params.set('pn', payeeName);
  params.set('am', amount.toFixed(2));
  params.set('cu', 'INR');
  params.set('tn', note);
  return `upi://pay?${params.toString()}`;
}

exports.generateUpiLinkForStudent = async ({ userId, feeType }) => {
  // 1. Find student
  const student = await Student.findOne({ userId }).populate('classId', 'name section').lean();
  if (!student) throw new Error('Student not found');

  // 2. Find pending fee (or other payment type)
  const fee = await Fee.findOne({ studentId: student._id, status: { $in: ['PENDING', 'PARTIAL'] } }).sort({ dueDate: 1 });
  if (!fee) throw new Error('No pending fee found');

  // 3. Prevent duplicate pending UPI payments
  const existing = await Payment.findOne({ studentId: student._id, feeId: fee._id, paymentStatus: 'PENDING', paymentMethod: 'UPI' });
  if (existing) throw new Error('A UPI payment is already pending for this fee');

  // 4. Prepare UPI link
  const amount = Number(fee.amountDue) - Number(fee.amountPaid || 0);
  if (!UPI_ID || !PAYEE_NAME || !amount || amount <= 0) throw new Error('Invalid UPI config or amount');

  const note = `${student.userId?.name || ''}, Roll ${student.rollNo || ''}, Class ${student.classId?.name || ''}, School Fee`;
  const upiLink = buildUpiLink({ upiId: UPI_ID, payeeName: PAYEE_NAME, amount, note: encodeURIComponentSafe(note) });

  // 5. Create payment record (status: PENDING)
  const payment = await Payment.create({
    studentId: student._id,
    feeId: fee._id,
    amount,
    transactionId: `UPI-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
    paymentStatus: 'PENDING',
    paymentMethod: 'UPI',
    logs: [{ source: 'REQUEST', status: 'PENDING', message: 'UPI deep link generated', payload: { upiLink } }]
  });

  await createActionLog({
    actorId: userId,
    action: 'UPI_LINK_GENERATED',
    module: 'FEE',
    entityId: String(fee._id),
    metadata: { paymentId: String(payment._id), amount, upiLink }
  });

  return {
    upiLink,
    amount,
    paymentId: payment._id,
    note,
    payee: PAYEE_NAME
  };
};
