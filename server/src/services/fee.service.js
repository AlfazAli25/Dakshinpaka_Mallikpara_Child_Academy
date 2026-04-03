const Fee = require('../models/fee.model');
const Student = require('../models/student.model');
const Payment = require('../models/payment.model');
const createCrudService = require('./crud.service');
const smepayService = require('./smepay.service');
const { createFeeReceipt } = require('./receipt.service');
const { createActionLog } = require('./action-log.service');
const { notifyAdminPaymentSubmitted } = require('./notification.service');
const { uploadPaymentScreenshot } = require('./cloudinary.service');

const base = createCrudService(Fee);

const findAll = (filter = {}) =>
	Fee.find(filter).populate({ path: 'studentId', populate: [{ path: 'userId' }, { path: 'classId' }] });
const findById = (id) =>
	Fee.findById(id).populate({ path: 'studentId', populate: [{ path: 'userId' }, { path: 'classId' }] });

const buildTransactionId = () => `TXN-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

const buildStudentPayload = (student) => ({
	name: student.name || 'Student',
	email: student.email || process.env.ADMIN_EMAIL || '',
	phone: student.phone || '',
	admissionNo: student.admissionNo || ''
});

const calculatePendingAmount = (fee) => Math.max((fee.amountDue || 0) - (fee.amountPaid || 0), 0);

const deriveFeeStatus = ({ amountDue, amountPaid }) => {
	const pending = Math.max((amountDue || 0) - (amountPaid || 0), 0);
	if (pending === 0) {
		return 'PAID';
	}

	return amountPaid > 0 ? 'PARTIALLY_PAID' : 'PENDING';
};

const calculatePayAmount = ({ amount, pendingAmount }) => {
	const requestedAmount = Number(amount || pendingAmount);
	if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
		const error = new Error('Invalid payment amount');
		error.statusCode = 400;
		throw error;
	}

	return Math.min(requestedAmount, pendingAmount);
};

const PENDING_SCREENSHOT_VERIFICATION_MESSAGE =
	'Payment screenshot pending verification. Please verify before processing payment.';

const findPendingStaticQrVerification = ({ feeId, studentId }) =>
	Payment.findOne({
		feeId,
		studentId,
		paymentStatus: 'PENDING_VERIFICATION',
		paymentMethod: 'STATIC_QR'
	});

const recordFeeReceipt = async ({ studentId, fee, payment, amount, paymentMethod, generatedBy }) => {
	const student = await Student.findById(studentId).populate('userId classId');
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
		generatedBy
	});
};

const createSmepayQrPaymentByStudent = async ({ feeId, userId, amount }) => {
	const student = await Student.findOne({ userId });
	if (!student) {
		const error = new Error('Student record not found');
		error.statusCode = 404;
		throw error;
	}

	const fee = await Fee.findOne({ _id: feeId, studentId: student._id });
	if (!fee) {
		const error = new Error('Fee record not found for this student');
		error.statusCode = 404;
		throw error;
	}

	const pendingAmount = calculatePendingAmount(fee);
	if (pendingAmount <= 0) {
		const error = new Error('This fee item is already fully paid');
		error.statusCode = 400;
		throw error;
	}

	const payAmount = calculatePayAmount({ amount, pendingAmount });

	const alreadyPending = await Payment.findOne({
		feeId: fee._id,
		studentId: student._id,
		paymentStatus: 'PENDING',
		amount: payAmount
	}).sort({ createdAt: -1 });

	if (alreadyPending) {
		return alreadyPending;
	}

	const transactionId = buildTransactionId();

	const payment = await Payment.create({
		studentId: student._id,
		feeId: fee._id,
		amount: payAmount,
		transactionId,
		paymentStatus: 'PENDING',
		paymentMethod: 'SMEPAY_QR',
		logs: [
			{
				source: 'REQUEST',
				status: 'PENDING',
				message: 'Payment request created locally before SMEpay call',
				payload: { feeId: String(fee._id), amount: payAmount }
			}
		]
	});

	try {
		const gatewayResponse = await smepayService.createDynamicQr({
			transactionId,
			amount: payAmount,
			student: buildStudentPayload(student)
		});

		payment.providerOrderId = gatewayResponse.providerOrderId;
		payment.providerReferenceId = gatewayResponse.providerReferenceId;
		payment.qrCodeData = gatewayResponse.qrCodeData;
		payment.rawProviderResponse = gatewayResponse.raw;
		payment.logs.push({
			source: 'REQUEST',
			status: 'PENDING',
			message: 'SMEpay QR created successfully',
			payload: gatewayResponse.raw
		});
		await payment.save();

		await createActionLog({
			actorId: userId,
			action: 'FEE_SMEPAY_QR_CREATED',
			module: 'FEE',
			entityId: String(fee._id),
			metadata: { paymentId: String(payment._id), amount: payAmount, transactionId }
		});

		return payment;
	} catch (error) {
		payment.paymentStatus = 'FAILED';
		payment.logs.push({
			source: 'REQUEST',
			status: 'FAILED',
			message: error.message || 'SMEpay QR creation failed',
			payload: error.providerResponse || null
		});
		await payment.save();
		throw error;
	}
};

const applySuccessfulPaymentToFee = async ({ paymentDoc, method }) => {
	const fee = await Fee.findById(paymentDoc.feeId);
	if (!fee) {
		const error = new Error('Fee record linked to payment was not found');
		error.statusCode = 404;
		throw error;
	}

	const pendingAmount = calculatePendingAmount(fee);
	const appliedAmount = Math.min(paymentDoc.amount, pendingAmount);

	if (appliedAmount > 0) {
		fee.amountPaid = (fee.amountPaid || 0) + appliedAmount;
		fee.paymentDate = new Date();
		fee.paymentMethod = method;
		fee.status = deriveFeeStatus({ amountDue: fee.amountDue, amountPaid: fee.amountPaid });
		await fee.save();
	}

	return { fee, appliedAmount };
};

const processSmepayWebhook = async ({ payload, rawBody, signature }) => {
	const isValid = smepayService.verifyWebhookSignature({ rawBody, signature });
	if (!isValid) {
		const error = new Error('Invalid SMEpay webhook signature');
		error.statusCode = 401;
		throw error;
	}

	const transactionId = payload.transactionId || payload.transaction_id || payload.orderId || payload.order_id;
	if (!transactionId) {
		const error = new Error('transactionId is missing in webhook payload');
		error.statusCode = 400;
		throw error;
	}

	const normalizedStatus = smepayService.normalizeStatus(payload.status || payload.paymentStatus);
	const payment = await Payment.findOne({ transactionId });
	if (!payment) {
		const error = new Error('Payment record not found for transactionId');
		error.statusCode = 404;
		throw error;
	}

	payment.logs.push({
		source: 'WEBHOOK',
		status: normalizedStatus,
		message: 'Received webhook event from SMEpay',
		payload
	});

	if (payment.paymentStatus === 'SUCCESS') {
		await payment.save();
		return { payment, idempotent: true, updated: false };
	}

	if (normalizedStatus === 'SUCCESS') {
		payment.paymentStatus = 'SUCCESS';
		payment.paidAt = new Date();
		payment.providerReferenceId = payload.referenceId || payload.reference_id || payment.providerReferenceId;
		await payment.save();

		const { fee, appliedAmount } = await applySuccessfulPaymentToFee({ paymentDoc: payment, method: 'smepay_qr' });
		await recordFeeReceipt({
			studentId: payment.studentId,
			fee,
			payment,
			amount: appliedAmount,
			paymentMethod: 'SMEPAY_QR'
		});
		payment.logs.push({
			source: 'WEBHOOK',
			status: 'SUCCESS',
			message: `Applied INR ${appliedAmount} to fee ledger`,
			payload: { appliedAmount }
		});
		await payment.save();
		await createActionLog({
			action: 'FEE_SMEPAY_SUCCESS',
			module: 'FEE',
			entityId: String(fee._id),
			metadata: { paymentId: String(payment._id), appliedAmount, transactionId }
		});
		return { payment, idempotent: false, updated: true };
	}

	if (normalizedStatus === 'FAILED' || normalizedStatus === 'CANCELLED') {
		payment.paymentStatus = normalizedStatus;
		await payment.save();
		return { payment, idempotent: false, updated: true };
	}

	await payment.save();
	return { payment, idempotent: false, updated: false };
};

const getPaymentStatusByTransactionForStudent = async ({ transactionId, userId }) => {
	const student = await Student.findOne({ userId });
	if (!student) {
		const error = new Error('Student record not found');
		error.statusCode = 404;
		throw error;
	}

	const payment = await Payment.findOne({ transactionId, studentId: student._id });
	if (!payment) {
		const error = new Error('Payment record not found for this student');
		error.statusCode = 404;
		throw error;
	}

	return payment;
};

const payCashByAdmin = async ({ feeId, adminUserId, amount }) => {
	const fee = await Fee.findById(feeId);
	if (!fee) {
		const error = new Error('Fee record not found');
		error.statusCode = 404;
		throw error;
	}

	const pendingScreenshotVerification = await findPendingStaticQrVerification({ feeId: fee._id, studentId: fee.studentId });
	if (pendingScreenshotVerification) {
		const error = new Error(PENDING_SCREENSHOT_VERIFICATION_MESSAGE);
		error.statusCode = 409;
		throw error;
	}

	const pendingAmount = calculatePendingAmount(fee);
	if (pendingAmount <= 0) {
		const error = new Error('This fee item is already fully paid');
		error.statusCode = 400;
		throw error;
	}

	const payAmount = calculatePayAmount({ amount, pendingAmount });
	const transactionId = `CASH-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

	const payment = await Payment.create({
		studentId: fee.studentId,
		feeId: fee._id,
		amount: payAmount,
		transactionId,
		paymentStatus: 'SUCCESS',
		paymentMethod: 'CASH',
		processedByAdmin: adminUserId,
		paidAt: new Date(),
		logs: [
			{
				source: 'REQUEST',
				status: 'SUCCESS',
				message: 'Cash payment processed by admin',
				payload: { processedByAdmin: String(adminUserId) }
			}
		]
	});
	fee.status = 'PENDING_VERIFICATION';
	await fee.save();

	const { fee: updatedFee, appliedAmount } = await applySuccessfulPaymentToFee({ paymentDoc: payment, method: 'cash' });
	const receipt = await recordFeeReceipt({
		studentId: fee.studentId,
		fee: updatedFee,
		payment,
		amount: appliedAmount,
		paymentMethod: 'CASH',
		generatedBy: adminUserId
	});

	await createActionLog({
		actorId: adminUserId,
		action: 'FEE_CASH_PAYMENT_PROCESSED',
		module: 'FEE',
		entityId: String(updatedFee._id),
		metadata: { paymentId: String(payment._id), amount: appliedAmount }
	});

	return { fee: updatedFee, payment, receipt };
};

const payOnlineByAdmin = async ({ feeId, adminUserId, amount, transactionReference }) => {
	const fee = await Fee.findById(feeId);
	if (!fee) {
		const error = new Error('Fee record not found');
		error.statusCode = 404;
		throw error;
	}

	const pendingScreenshotVerification = await findPendingStaticQrVerification({ feeId: fee._id, studentId: fee.studentId });
	if (pendingScreenshotVerification) {
		const error = new Error(PENDING_SCREENSHOT_VERIFICATION_MESSAGE);
		error.statusCode = 409;
		throw error;
	}

	const pendingAmount = calculatePendingAmount(fee);
	if (pendingAmount <= 0) {
		const error = new Error('This fee item is already fully paid');
		error.statusCode = 400;
		throw error;
	}

	const payAmount = calculatePayAmount({ amount, pendingAmount });
	const normalizedTransactionReference = String(transactionReference || '').trim();
	const payment = await Payment.create({
		studentId: fee.studentId,
		feeId: fee._id,
		amount: payAmount,
		transactionId: `ADMIN-ONLINE-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
		providerReferenceId: normalizedTransactionReference || undefined,
		paymentStatus: 'SUCCESS',
		paymentMethod: 'STATIC_QR',
		processedByAdmin: adminUserId,
		verifiedByAdmin: adminUserId,
		verifiedAt: new Date(),
		paidAt: new Date(),
		verificationNotes: 'Directly verified by admin during in-person payment',
		logs: [
			{
				source: 'REQUEST',
				status: 'SUCCESS',
				message: 'Online payment recorded directly by admin without screenshot upload',
				payload: {
					processedByAdmin: String(adminUserId),
					transactionReference: normalizedTransactionReference || null
				}
			}
		]
	});

	fee.status = 'PENDING_VERIFICATION';
	await fee.save();

	const { fee: updatedFee, appliedAmount } = await applySuccessfulPaymentToFee({ paymentDoc: payment, method: 'static_qr' });
	const receipt = await recordFeeReceipt({
		studentId: fee.studentId,
		fee: updatedFee,
		payment,
		amount: appliedAmount,
		paymentMethod: 'STATIC_QR',
		generatedBy: adminUserId
	});

	await createActionLog({
		actorId: adminUserId,
		action: 'FEE_ONLINE_PAYMENT_RECORDED_BY_ADMIN',
		module: 'FEE',
		entityId: String(updatedFee._id),
		metadata: {
			paymentId: String(payment._id),
			amount: appliedAmount,
			transactionReference: normalizedTransactionReference || null
		}
	});

	return { fee: updatedFee, payment, receipt };
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

	const student = await Student.findOne({ userId }).populate('userId classId');
	if (!student) {
		const error = new Error('Student record not found');
		error.statusCode = 404;
		throw error;
	}

	const fee = await Fee.findOne({ _id: feeId, studentId: student._id });
	if (!fee) {
		const error = new Error('Fee record not found for this student');
		error.statusCode = 404;
		throw error;
	}

	const pendingAmount = calculatePendingAmount(fee);
	if (pendingAmount <= 0) {
		const error = new Error('This fee item is already fully paid');
		error.statusCode = 400;
		throw error;
	}

	const payAmount = calculatePayAmount({ amount, pendingAmount });
	const existing = await Payment.findOne({
		feeId: fee._id,
		studentId: student._id,
		paymentStatus: 'PENDING_VERIFICATION',
		paymentMethod: 'STATIC_QR'
	});
	if (existing) {
		const error = new Error('A static QR payment is already pending verification for this fee item');
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

	const payment = await Payment.create({
		studentId: student._id,
		feeId: fee._id,
		amount: payAmount,
		transactionId: transactionReference || `STATIC-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
		providerReferenceId: transactionReference,
		paymentStatus: 'PENDING_VERIFICATION',
		paymentMethod: 'STATIC_QR',
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
					screenshotPublicId: uploadedScreenshot.publicId
				}
			}
		]
	});

	fee.status = 'PENDING_VERIFICATION';
	await fee.save();

	await notifyAdminPaymentSubmitted({
		studentId: student._id,
		studentName: student.userId?.name || 'Student',
		paymentId: payment._id
	});

	await createActionLog({
		actorId: userId,
		action: 'FEE_STATIC_QR_SUBMITTED',
		module: 'FEE',
		entityId: String(fee._id),
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
		payment.paymentStatus = 'SUCCESS';
		payment.verifiedByAdmin = adminUserId;
		payment.verifiedAt = new Date();
		payment.paidAt = new Date();
		payment.verificationNotes = notes;
		if (transactionReference) {
			payment.providerReferenceId = transactionReference;
		}
		await payment.save();

		const { fee, appliedAmount } = await applySuccessfulPaymentToFee({ paymentDoc: payment, method: 'static_qr' });
		const receipt = await recordFeeReceipt({
			studentId: payment.studentId,
			fee,
			payment,
			amount: appliedAmount,
			paymentMethod: 'STATIC_QR',
			generatedBy: adminUserId
		});

		await createActionLog({
			actorId: adminUserId,
			action: 'FEE_STATIC_QR_APPROVED',
			module: 'FEE',
			entityId: String(fee._id),
			metadata: { paymentId: String(payment._id), amount: appliedAmount }
		});

		return { payment, fee, receipt };
	}

	if (decision === 'REJECT') {
		payment.paymentStatus = 'FAILED';
		payment.verifiedByAdmin = adminUserId;
		payment.verifiedAt = new Date();
		payment.verificationNotes = notes;
		await payment.save();

		const fee = await Fee.findById(payment.feeId);
		if (fee) {
			fee.status = 'FAILED';
			await fee.save();
		}

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

	return Payment.find({ studentId: student._id }).populate('processedByAdmin', 'name email').sort({ createdAt: -1 });
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
	createSmepayQrPaymentByStudent,
	uploadStaticQrScreenshotByStudent,
	listPendingVerificationPayments,
	verifyStaticQrPaymentByAdmin,
	processSmepayWebhook,
	getPaymentStatusByTransactionForStudent,
	getStudentPaymentsForAdmin,
	getStudentPaymentsForStudent,
	getPaymentScreenshotPathForAdmin
};