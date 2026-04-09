const mongoose = require('mongoose');
const Fee = require('../models/fee.model');
const Student = require('../models/student.model');
const Payment = require('../models/payment.model');
const NoticePayment = require('../models/notice-payment.model');
const createCrudService = require('./crud.service');
const { createFeeReceipt } = require('./receipt.service');
const { createActionLog } = require('./action-log.service');
const { notifyAdminPaymentSubmitted } = require('./notification.service');
const { uploadPaymentScreenshot } = require('./cloudinary.service');
const {
ensureMonthlyFeesForStudent,
ensureMonthlyFeesForAllStudents,
calculateFeePendingAmount,
deriveFeeStatus
} = require('./monthly-fee-ledger.service');

const base = createCrudService(Fee);

const PENDING_SCREENSHOT_VERIFICATION_MESSAGE =
'Payment screenshot pending verification. Please verify before processing payment.';

const normalizeNoticePaymentStatus = (status) => {
const normalized = String(status || '').trim().toUpperCase();
if (normalized === 'VERIFIED' || normalized === 'PAID') {
return 'SUCCESS';
}
if (normalized === 'REJECTED') {
return 'FAILED';
}
if (normalized === 'PENDING' || normalized === 'PENDING_VERIFICATION') {
return 'PENDING_VERIFICATION';
}
return 'PENDING_VERIFICATION';
};

const findAll = async (filter = {}) => {
if (filter?.studentId) {
await ensureMonthlyFeesForStudent({ studentId: filter.studentId });
} else {
await ensureMonthlyFeesForAllStudents();
}

return Fee.find(filter)
.populate({ path: 'studentId', populate: [{ path: 'userId' }, { path: 'classId' }] })
.sort({ dueDate: 1, createdAt: 1 });
};

const findById = async (id) =>
Fee.findById(id).populate({ path: 'studentId', populate: [{ path: 'userId' }, { path: 'classId' }] });

const buildTransactionId = (prefix = 'TXN') => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

const resolveRequestedAmount = ({ amount, totalPendingAmount }) => {
const fallbackAmount =
amount === undefined || amount === null || String(amount).trim() === '' ? totalPendingAmount : Number(amount);

if (!Number.isFinite(fallbackAmount) || fallbackAmount <= 0) {
const error = new Error('Invalid payment amount');
error.statusCode = 400;
throw error;
}

if (fallbackAmount > totalPendingAmount) {
const error = new Error('Payment amount exceeds total pending balance');
error.statusCode = 400;
throw error;
}

return Number(fallbackAmount.toFixed(2));
};

const getSessionQuery = (query, session) => (session ? query.session(session) : query);

const getPendingFeeRowsForStudent = async ({ studentId, session }) => {
const feeRows = await getSessionQuery(
Fee.find({ studentId }).sort({ dueDate: 1, createdAt: 1 }),
session
);

const pendingRows = feeRows
.map((fee) => ({ fee, pendingAmount: calculateFeePendingAmount(fee) }))
.filter((item) => item.pendingAmount > 0);

const totalPendingAmount = Number(
pendingRows.reduce((sum, item) => sum + item.pendingAmount, 0).toFixed(2)
);

return {
feeRows,
pendingRows,
totalPendingAmount
};
};

const findPendingStaticQrVerification = ({ studentId, excludePaymentId, session }) => {
const query = {
studentId,
paymentStatus: 'PENDING_VERIFICATION',
paymentMethod: 'STATIC_QR'
};

if (excludePaymentId) {
query._id = { $ne: excludePaymentId };
}

return getSessionQuery(Payment.findOne(query), session);
};

const recordFeeReceipt = async ({ studentId, fee, payment, amount, paymentMethod, generatedBy, session }) => {
const student = await getSessionQuery(
Student.findById(studentId).populate([
{ path: 'userId', select: 'name email role' },
{ path: 'classId', select: 'name section' }
]),
session
);
if (!student) {
return null;
}

return createFeeReceipt({
student,
fee,
payment,
amount,
paymentMethod,
transactionReference: payment?.providerReferenceId || payment?.transactionId,
generatedBy,
session
});
};

const allocatePaymentAcrossOldestMonths = async ({ studentId, amount, paymentMethod, session }) => {
const { pendingRows, totalPendingAmount } = await getPendingFeeRowsForStudent({ studentId, session });
if (totalPendingAmount <= 0) {
const error = new Error('No pending monthly fees found for this student');
error.statusCode = 400;
throw error;
}

const payAmount = resolveRequestedAmount({ amount, totalPendingAmount });
let remainingAmount = payAmount;
const allocationRows = [];
const updatedFees = [];
const paymentDate = new Date();

for (const { fee, pendingAmount } of pendingRows) {
if (remainingAmount <= 0) {
break;
}

const appliedAmount = Math.min(pendingAmount, remainingAmount);
if (appliedAmount <= 0) {
continue;
}

fee.amountPaid = Number((Number(fee.amountPaid || 0) + appliedAmount).toFixed(2));
fee.status = deriveFeeStatus({ amountDue: fee.amountDue, amountPaid: fee.amountPaid });
fee.paymentDate = paymentDate;
fee.paymentMethod = paymentMethod;
await fee.save({ session });

updatedFees.push(fee);
allocationRows.push({
feeId: fee._id,
monthKey: fee.monthKey,
amount: appliedAmount
});

remainingAmount = Number((remainingAmount - appliedAmount).toFixed(2));
}

const remainingBalance = Number(Math.max(totalPendingAmount - payAmount, 0).toFixed(2));

return {
payAmount,
totalPendingAmount,
remainingBalance,
allocations: allocationRows,
updatedFees,
primaryFee: updatedFees[0] || null
};
};

const runWithOptionalTransaction = async (handler) => {
const session = await mongoose.startSession();
try {
let result;
try {
await session.withTransaction(async () => {
result = await handler(session);
});
return result;
} catch (error) {
const message = String(error?.message || '');
const transactionUnsupported =
message.includes('Transaction numbers are only allowed') ||
message.includes('replica set') ||
message.includes('NoSuchTransaction');

if (!transactionUnsupported) {
throw error;
}

return handler(null);
}
} finally {
await session.endSession();
}
};

const payCashByAdmin = async ({ feeId, adminUserId, amount }) => {
const result = await runWithOptionalTransaction(async (session) => {
const selectedFee = await getSessionQuery(Fee.findById(feeId), session);
if (!selectedFee) {
const error = new Error('Fee record not found');
error.statusCode = 404;
throw error;
}

await ensureMonthlyFeesForStudent({ studentId: selectedFee.studentId, session });
const pendingScreenshotVerification = await findPendingStaticQrVerification({
studentId: selectedFee.studentId,
session
});
if (pendingScreenshotVerification) {
const error = new Error(PENDING_SCREENSHOT_VERIFICATION_MESSAGE);
error.statusCode = 409;
throw error;
}

const allocation = await allocatePaymentAcrossOldestMonths({
studentId: selectedFee.studentId,
amount,
paymentMethod: 'CASH',
session
});

const payment = await Payment.create(
[
{
studentId: selectedFee.studentId,
feeId: allocation.primaryFee?._id || selectedFee._id,
amount: allocation.payAmount,
transactionId: buildTransactionId('CASH'),
paymentStatus: 'SUCCESS',
paymentMethod: 'CASH',
processedBy: 'ADMIN',
processedByAdmin: adminUserId,
remainingBalance: allocation.remainingBalance,
paidAt: new Date(),
allocations: allocation.allocations,
logs: [
{
source: 'REQUEST',
status: 'SUCCESS',
message: 'Cash payment processed by admin and allocated to monthly ledger',
payload: {
processedByAdmin: String(adminUserId),
remainingBalance: allocation.remainingBalance,
allocationCount: allocation.allocations.length
}
}
]
}
],
{ session }
);

const paymentDoc = payment[0];
const receipt = await recordFeeReceipt({
studentId: selectedFee.studentId,
fee: allocation.primaryFee,
payment: paymentDoc,
amount: allocation.payAmount,
paymentMethod: 'CASH',
generatedBy: adminUserId,
session
});

return { fee: allocation.primaryFee, payment: paymentDoc, receipt, allocation };
});

await createActionLog({
actorId: adminUserId,
action: 'FEE_CASH_PAYMENT_PROCESSED',
module: 'FEE',
entityId: String(result.fee?._id || ''),
metadata: {
paymentId: String(result.payment._id),
amount: result.allocation.payAmount,
remainingBalance: result.allocation.remainingBalance,
allocations: result.allocation.allocations
}
});

return { fee: result.fee, payment: result.payment, receipt: result.receipt };
};

const payOnlineByAdmin = async ({ feeId, adminUserId, amount, transactionReference }) => {
const normalizedTransactionReference = String(transactionReference || '').trim();

const result = await runWithOptionalTransaction(async (session) => {
const selectedFee = await getSessionQuery(Fee.findById(feeId), session);
if (!selectedFee) {
const error = new Error('Fee record not found');
error.statusCode = 404;
throw error;
}

await ensureMonthlyFeesForStudent({ studentId: selectedFee.studentId, session });
const pendingScreenshotVerification = await findPendingStaticQrVerification({
studentId: selectedFee.studentId,
session
});
if (pendingScreenshotVerification) {
const error = new Error(PENDING_SCREENSHOT_VERIFICATION_MESSAGE);
error.statusCode = 409;
throw error;
}

const allocation = await allocatePaymentAcrossOldestMonths({
studentId: selectedFee.studentId,
amount,
paymentMethod: 'STATIC_QR',
session
});

const payment = await Payment.create(
[
{
studentId: selectedFee.studentId,
feeId: allocation.primaryFee?._id || selectedFee._id,
amount: allocation.payAmount,
transactionId: buildTransactionId('ADMIN-ONLINE'),
providerReferenceId: normalizedTransactionReference || undefined,
paymentStatus: 'SUCCESS',
paymentMethod: 'STATIC_QR',
processedBy: 'ADMIN',
processedByAdmin: adminUserId,
verifiedByAdmin: adminUserId,
verifiedAt: new Date(),
paidAt: new Date(),
verificationNotes: 'Directly verified by admin during in-person payment',
remainingBalance: allocation.remainingBalance,
allocations: allocation.allocations,
logs: [
{
source: 'REQUEST',
status: 'SUCCESS',
message: 'Online payment recorded directly by admin and allocated to monthly ledger',
payload: {
processedByAdmin: String(adminUserId),
transactionReference: normalizedTransactionReference || null,
remainingBalance: allocation.remainingBalance,
allocationCount: allocation.allocations.length
}
}
]
}
],
{ session }
);

const paymentDoc = payment[0];
const receipt = await recordFeeReceipt({
studentId: selectedFee.studentId,
fee: allocation.primaryFee,
payment: paymentDoc,
amount: allocation.payAmount,
paymentMethod: 'STATIC_QR',
generatedBy: adminUserId,
session
});

return { fee: allocation.primaryFee, payment: paymentDoc, receipt, allocation };
});

await createActionLog({
actorId: adminUserId,
action: 'FEE_ONLINE_PAYMENT_RECORDED_BY_ADMIN',
module: 'FEE',
entityId: String(result.fee?._id || ''),
metadata: {
paymentId: String(result.payment._id),
amount: result.allocation.payAmount,
remainingBalance: result.allocation.remainingBalance,
transactionReference: normalizedTransactionReference || null,
allocations: result.allocation.allocations
}
});

return { fee: result.fee, payment: result.payment, receipt: result.receipt };
};

const uploadStaticQrScreenshotByStudent = async ({ feeId, userId, file, amount, transactionReference }) => {
if (!file) {
const error = new Error('Payment screenshot is required');
error.statusCode = 400;
throw error;
}

if (!file.buffer) {
const error = new Error('Payment screenshot payload is invalid');
error.statusCode = 400;
throw error;
}

const student = await Student.findOne({ userId }).populate([
{ path: 'userId', select: 'name email role' },
{ path: 'classId', select: 'name section' }
]);
if (!student) {
const error = new Error('Student record not found');
error.statusCode = 404;
throw error;
}

const selectedFee = await Fee.findOne({ _id: feeId, studentId: student._id });
if (!selectedFee) {
const error = new Error('Fee record not found for this student');
error.statusCode = 404;
throw error;
}

await ensureMonthlyFeesForStudent({ studentId: student._id });
const { pendingRows, totalPendingAmount } = await getPendingFeeRowsForStudent({ studentId: student._id });
if (totalPendingAmount <= 0) {
const error = new Error('All monthly fees are already paid');
error.statusCode = 400;
throw error;
}

const payAmount = resolveRequestedAmount({ amount, totalPendingAmount });
const existing = await findPendingStaticQrVerification({ studentId: student._id });
if (existing) {
const error = new Error('A static QR payment is already pending verification for this student');
error.statusCode = 409;
throw error;
}

let uploadedScreenshot;
try {
uploadedScreenshot = await uploadPaymentScreenshot({
buffer: file.buffer,
mimeType: file.mimetype,
originalName: file.originalname
});
} catch (error) {
if (!error.statusCode) {
error.statusCode = 502;
error.message = 'Failed to upload screenshot to storage provider';
}
throw error;
}

const primaryPendingFee = pendingRows[0]?.fee || selectedFee;
const normalizedTransactionReference = String(transactionReference || '').trim();
const payment = await Payment.create({
studentId: student._id,
feeId: primaryPendingFee._id,
amount: payAmount,
transactionId: buildTransactionId('STATIC'),
providerReferenceId: normalizedTransactionReference || undefined,
paymentStatus: 'PENDING_VERIFICATION',
paymentMethod: 'STATIC_QR',
processedBy: 'SYSTEM',
remainingBalance: Number(Math.max(totalPendingAmount - payAmount, 0).toFixed(2)),
screenshotPath: uploadedScreenshot.secureUrl,
screenshotPublicId: uploadedScreenshot.publicId,
logs: [
{
source: 'REQUEST',
status: 'PENDING_VERIFICATION',
message: 'Student uploaded static QR screenshot for verification',
payload: {
originalName: file.originalname,
size: file.size,
storage: 'cloudinary',
screenshotPublicId: uploadedScreenshot.publicId,
requestedAmount: payAmount,
remainingBalanceAfterApproval: Number(Math.max(totalPendingAmount - payAmount, 0).toFixed(2))
}
}
]
});

await notifyAdminPaymentSubmitted({
studentId: student._id,
studentName: student.userId?.name || 'Student',
paymentId: payment._id
});

await createActionLog({
actorId: userId,
action: 'FEE_STATIC_QR_SUBMITTED',
module: 'FEE',
entityId: String(primaryPendingFee._id),
metadata: { paymentId: String(payment._id), amount: payAmount }
});

return payment;
};

const listPendingVerificationPayments = async () =>
Payment.find({ paymentStatus: 'PENDING_VERIFICATION', paymentMethod: 'STATIC_QR' })
.populate({ path: 'studentId', populate: [{ path: 'userId' }, { path: 'classId' }] })
.populate('feeId')
.sort({ createdAt: -1 });

const verifyStaticQrPaymentByAdmin = async ({ paymentId, decision, adminUserId, notes, transactionReference }) => {
const payment = await Payment.findById(paymentId);
if (!payment) {
const error = new Error('Payment record not found');
error.statusCode = 404;
throw error;
}

if (payment.paymentStatus !== 'PENDING_VERIFICATION') {
const error = new Error('Payment is already verified');
error.statusCode = 409;
throw error;
}

if (decision === 'APPROVE') {
const normalizedTransactionReference = String(transactionReference || '').trim();
const result = await runWithOptionalTransaction(async (session) => {
const paymentDoc = await getSessionQuery(Payment.findById(paymentId), session);
if (!paymentDoc) {
const error = new Error('Payment record not found');
error.statusCode = 404;
throw error;
}

if (paymentDoc.paymentStatus !== 'PENDING_VERIFICATION') {
const error = new Error('Payment is already verified');
error.statusCode = 409;
throw error;
}

await ensureMonthlyFeesForStudent({ studentId: paymentDoc.studentId, session });
const allocation = await allocatePaymentAcrossOldestMonths({
studentId: paymentDoc.studentId,
amount: paymentDoc.amount,
paymentMethod: 'STATIC_QR',
session
});

paymentDoc.paymentStatus = 'SUCCESS';
paymentDoc.processedBy = 'ADMIN';
paymentDoc.verifiedByAdmin = adminUserId;
paymentDoc.verifiedAt = new Date();
paymentDoc.paidAt = new Date();
paymentDoc.verificationNotes = notes;
paymentDoc.feeId = allocation.primaryFee?._id || paymentDoc.feeId;
paymentDoc.allocations = allocation.allocations;
paymentDoc.remainingBalance = allocation.remainingBalance;
if (normalizedTransactionReference) {
paymentDoc.providerReferenceId = normalizedTransactionReference;
}
await paymentDoc.save({ session });

const receipt = await recordFeeReceipt({
studentId: paymentDoc.studentId,
fee: allocation.primaryFee,
payment: paymentDoc,
amount: allocation.payAmount,
paymentMethod: 'STATIC_QR',
generatedBy: adminUserId,
session
});

return { payment: paymentDoc, fee: allocation.primaryFee, receipt, allocation };
});

await createActionLog({
actorId: adminUserId,
action: 'FEE_STATIC_QR_APPROVED',
module: 'FEE',
entityId: String(result.fee?._id || ''),
metadata: {
paymentId: String(result.payment._id),
amount: result.allocation.payAmount,
remainingBalance: result.allocation.remainingBalance,
allocations: result.allocation.allocations
}
});

return { payment: result.payment, fee: result.fee, receipt: result.receipt };
}

if (decision === 'REJECT') {
payment.paymentStatus = 'FAILED';
payment.processedBy = 'ADMIN';
payment.verifiedByAdmin = adminUserId;
payment.verifiedAt = new Date();
payment.verificationNotes = notes;
await payment.save();

await createActionLog({
actorId: adminUserId,
action: 'FEE_STATIC_QR_REJECTED',
module: 'FEE',
entityId: String(payment.feeId),
metadata: { paymentId: String(payment._id) }
});

return { payment, fee: null, receipt: null };
}

const error = new Error('Invalid verification decision');
error.statusCode = 400;
throw error;
};

const getStudentPaymentsForAdmin = async ({ studentId }) =>
Payment.find({ studentId })
.populate('processedByAdmin', 'name email')
.sort({ createdAt: -1 });

const getStudentPaymentsForStudent = async ({ userId }) => {
const student = await Student.findOne({ userId });
if (!student) {
const error = new Error('Student record not found');
error.statusCode = 404;
throw error;
}

const [feePayments, noticePayments] = await Promise.all([
Payment.find({ studentId: student._id })
.select('amount paymentStatus paymentMethod screenshotPath transactionReference createdAt paidAt processedByAdmin')
.populate('processedByAdmin', 'name email')
.sort({ createdAt: -1 })
.lean(),
NoticePayment.find({ studentId: student._id })
.select('amount paymentStatus screenshotPath transactionReference paymentDate createdAt verifiedBy noticeId')
.populate({ path: 'verifiedBy', select: 'name email' })
.populate({ path: 'noticeId', select: 'title' })
.sort({ paymentDate: -1, createdAt: -1 })
.lean()
]);

const mappedFeePayments = feePayments.map((item) => ({
...item,
sourceType: 'FEE',
sourceLabel: 'Fee Payment'
}));

const mappedNoticePayments = noticePayments.map((item) => ({
_id: `notice-${String(item._id || '')}`,
amount: item.amount,
paymentStatus: normalizeNoticePaymentStatus(item.paymentStatus),
paymentMethod: 'NOTICE_PAYMENT',
screenshotPath: item.screenshotPath,
transactionReference: item.transactionReference,
createdAt: item.paymentDate || item.createdAt,
paidAt: item.paymentDate || item.createdAt,
processedByAdmin: item.verifiedBy || null,
sourceType: 'NOTICE',
sourceLabel: item.noticeId?.title ? `Notice: ${item.noticeId.title}` : 'Notice Payment'
}));

return [...mappedFeePayments, ...mappedNoticePayments]
.sort((left, right) => {
const leftTime = new Date(left.paidAt || left.createdAt || 0).getTime();
const rightTime = new Date(right.paidAt || right.createdAt || 0).getTime();
return rightTime - leftTime;
});
};

const getPaymentScreenshotPathForAdmin = async ({ paymentId }) => {
const payment = await Payment.findById(paymentId);
if (!payment) {
const error = new Error('Payment record not found');
error.statusCode = 404;
throw error;
}

if (!payment.screenshotPath) {
const error = new Error('Screenshot not found for this payment');
error.statusCode = 404;
throw error;
}

return payment.screenshotPath;
};

module.exports = {
...base,
findAll,
findById,
payCashByAdmin,
payOnlineByAdmin,
uploadStaticQrScreenshotByStudent,
listPendingVerificationPayments,
verifyStaticQrPaymentByAdmin,
getStudentPaymentsForAdmin,
getStudentPaymentsForStudent,
getPaymentScreenshotPathForAdmin
};
