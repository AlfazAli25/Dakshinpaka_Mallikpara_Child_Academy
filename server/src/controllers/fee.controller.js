const createCrudController = require('./crud.controller.factory');
const asyncHandler = require('../middleware/async.middleware');
const feeService = require('../services/fee.service');
const Student = require('../models/student.model');

const base = createCrudController(feeService, 'Fee');

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ''));

const list = asyncHandler(async (req, res) => {
	if (req.user?.role === 'admin') {
		const data = await feeService.findAll(req.query || {});
		return res.json({ success: true, data });
	}

	if (req.user?.role === 'student') {
		const student = await Student.findOne({ userId: req.user._id });
		if (!student) {
			return res.json({ success: true, data: [] });
		}

		const data = await feeService.findAll({ studentId: student._id });
		return res.json({ success: true, data });
	}

	return res.status(403).json({ success: false, message: 'Forbidden' });
});

const payCash = asyncHandler(async (req, res) => {
	const result = await feeService.payCashByAdmin({
		feeId: req.params.id,
		adminUserId: req.user._id,
		amount: req.body?.amount
	});

	res.json({ success: true, data: result, message: 'Cash payment recorded successfully' });
});

const payOnline = asyncHandler(async (req, res) => {
	const result = await feeService.payOnlineByAdmin({
		feeId: req.params.id,
		adminUserId: req.user._id,
		amount: req.body?.amount,
		transactionReference: req.body?.transactionReference
	});

	res.json({ success: true, data: result, message: 'Online payment recorded successfully' });
});

const createSmepayQr = asyncHandler(async (req, res) => {
	const payment = await feeService.createSmepayQrPaymentByStudent({
		feeId: req.params.id,
		userId: req.user._id,
		amount: req.body?.amount
	});

	res.status(201).json({
		success: true,
		message: 'SMEpay dynamic QR generated successfully',
		data: {
			studentId: payment.studentId,
			amount: payment.amount,
			transactionId: payment.transactionId,
			paymentStatus: payment.paymentStatus,
			qrCodeData: payment.qrCodeData,
			providerOrderId: payment.providerOrderId,
			createdAt: payment.createdAt,
			updatedAt: payment.updatedAt
		}
	});
});

const smepayWebhook = asyncHandler(async (req, res) => {
	const signature = req.headers['x-smepay-signature'] || req.headers['x-signature'];
	const result = await feeService.processSmepayWebhook({
		payload: req.body,
		rawBody: req.rawBody,
		signature
	});

	res.json({
		success: true,
		message: result.idempotent ? 'Duplicate webhook ignored safely' : 'Webhook processed successfully',
		data: {
			transactionId: result.payment.transactionId,
			paymentStatus: result.payment.paymentStatus,
			updated: result.updated
		}
	});
});

const getPaymentStatus = asyncHandler(async (req, res) => {
	const payment = await feeService.getPaymentStatusByTransactionForStudent({
		transactionId: req.params.transactionId,
		userId: req.user._id
	});

	res.json({
		success: true,
		data: {
			studentId: payment.studentId,
			amount: payment.amount,
			transactionId: payment.transactionId,
			paymentStatus: payment.paymentStatus,
			createdAt: payment.createdAt,
			updatedAt: payment.updatedAt,
			qrCodeData: payment.qrCodeData
		}
	});
});

const uploadStaticQrScreenshot = asyncHandler(async (req, res) => {
	const payment = await feeService.uploadStaticQrScreenshotByStudent({
		feeId: req.params.id,
		userId: req.user._id,
		file: req.file,
		amount: req.body?.amount,
		transactionReference: req.body?.transactionReference
	});

	res.status(201).json({
		success: true,
		message: 'Payment screenshot uploaded and marked as pending verification',
		data: payment
	});
});

const listPendingVerifications = asyncHandler(async (_req, res) => {
	const items = await feeService.listPendingVerificationPayments();
	res.json({ success: true, data: items });
});

const verifyStaticQrPayment = asyncHandler(async (req, res) => {
	const result = await feeService.verifyStaticQrPaymentByAdmin({
		paymentId: req.params.paymentId,
		decision: req.body?.decision,
		adminUserId: req.user._id,
		notes: req.body?.notes,
		transactionReference: req.body?.transactionReference
	});

	res.json({ success: true, data: result, message: 'Payment verification updated successfully' });
});

const getStudentPayments = asyncHandler(async (req, res) => {
	const payments = await feeService.getStudentPaymentsForAdmin({ studentId: req.params.studentId });
	res.json({ success: true, data: payments });
});

const getMyPayments = asyncHandler(async (req, res) => {
	const payments = await feeService.getStudentPaymentsForStudent({ userId: req.user._id });
	res.json({ success: true, data: payments });
});

const getPaymentScreenshot = asyncHandler(async (req, res) => {
	const screenshotPath = await feeService.getPaymentScreenshotPathForAdmin({ paymentId: req.params.paymentId });
	if (isHttpUrl(screenshotPath)) {
		const response = await fetch(screenshotPath);
		if (!response.ok) {
			const error = new Error('Unable to fetch screenshot from storage provider');
			error.statusCode = 502;
			throw error;
		}

		const contentType = response.headers.get('content-type');
		if (contentType) {
			res.setHeader('Content-Type', contentType);
		}

		const contentLength = response.headers.get('content-length');
		if (contentLength) {
			res.setHeader('Content-Length', contentLength);
		}

		const buffer = Buffer.from(await response.arrayBuffer());
		return res.send(buffer);
	}

	return res.sendFile(screenshotPath);
});

module.exports = {
	...base,
	list,
	payCash,
	payOnline,
	createSmepayQr,
	uploadStaticQrScreenshot,
	listPendingVerifications,
	verifyStaticQrPayment,
	getStudentPayments,
	getMyPayments,
	getPaymentScreenshot,
	smepayWebhook,
	getPaymentStatus
};