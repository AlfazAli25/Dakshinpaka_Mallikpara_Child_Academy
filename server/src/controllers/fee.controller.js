const createCrudController = require('./crud.controller.factory');
const asyncHandler = require('../middleware/async.middleware');
const feeService = require('../services/fee.service');
const Student = require('../models/student.model');

const base = createCrudController(feeService, 'Fee');

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ''));

const toPositiveInt = (value, fallback) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}

	return Math.floor(parsed);
};

const parsePagination = (query = {}) => {
	const rawPage = query.page ?? query._page;
	const rawLimit = query.limit ?? query._limit;
	if (rawPage === undefined && rawLimit === undefined) {
		return { hasPagination: false, page: 1, limit: 0 };
	}

	return {
		hasPagination: true,
		page: toPositiveInt(rawPage, 1),
		limit: Math.min(toPositiveInt(rawLimit, 20), 200)
	};
};

const list = asyncHandler(async (req, res) => {
	const query = req.query || {};
	const pagination = parsePagination(query);

	if (req.user?.role === 'admin') {
		if (pagination.hasPagination && typeof feeService.countDocuments === 'function') {
			const [data, total] = await Promise.all([
				feeService.findAll(query),
				feeService.countDocuments(query)
			]);

			return res.json({
				success: true,
				data,
				pagination: {
					page: pagination.page,
					limit: pagination.limit,
					total,
					totalPages: total === 0 ? 0 : Math.ceil(total / pagination.limit)
				}
			});
		}

		const data = await feeService.findAll(query);
		return res.json({ success: true, data });
	}

	if (req.user?.role === 'student') {
		const student = await Student.findOne({ userId: req.user._id });
		if (!student) {
			return res.json({ success: true, data: [] });
		}

		const filter = { ...query, studentId: student._id };
		if (pagination.hasPagination && typeof feeService.countDocuments === 'function') {
			const [data, total] = await Promise.all([
				feeService.findAll(filter),
				feeService.countDocuments(filter)
			]);

			return res.json({
				success: true,
				data,
				pagination: {
					page: pagination.page,
					limit: pagination.limit,
					total,
					totalPages: total === 0 ? 0 : Math.ceil(total / pagination.limit)
				}
			});
		}

		const data = await feeService.findAll(filter);
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
	uploadStaticQrScreenshot,
	listPendingVerifications,
	verifyStaticQrPayment,
	getStudentPayments,
	getMyPayments,
	getPaymentScreenshot
};