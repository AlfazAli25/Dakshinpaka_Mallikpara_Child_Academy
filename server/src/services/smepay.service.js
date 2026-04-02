const crypto = require('crypto');

const normalizeQrData = (payload = {}) => {
  return (
    payload.qrCode ||
    payload.qr_code ||
    payload.qrImage ||
    payload.qr_image ||
    payload.qrData ||
    payload.qr_data ||
    payload.paymentQr ||
    payload.payment_qr ||
    payload.upiQr ||
    ''
  );
};

const normalizeStatus = (status) => {
  const value = String(status || '').trim().toUpperCase();
  if (value === 'SUCCESS' || value === 'PAID' || value === 'CAPTURED') return 'SUCCESS';
  if (value === 'FAILED' || value === 'FAILURE' || value === 'DECLINED') return 'FAILED';
  if (value === 'CANCELLED' || value === 'CANCELED' || value === 'EXPIRED') return 'CANCELLED';
  return 'PENDING';
};

const getConfig = () => {
  const baseUrl = process.env.SMEPAY_BASE_URL;
  const merchantId = process.env.SMEPAY_MERCHANT_ID;
  const apiKey = process.env.SMEPAY_API_KEY;
  const webhookSecret = process.env.SMEPAY_WEBHOOK_SECRET;
  const callbackUrl = process.env.SMEPAY_CALLBACK_URL;

  if (!baseUrl || !merchantId || !apiKey || !webhookSecret || !callbackUrl) {
    const error = new Error('SMEpay configuration is incomplete');
    error.statusCode = 500;
    throw error;
  }

  return { baseUrl, merchantId, apiKey, webhookSecret, callbackUrl };
};

const createDynamicQr = async ({ transactionId, amount, student }) => {
  const { baseUrl, merchantId, apiKey, callbackUrl } = getConfig();

  const payload = {
    merchantId,
    transactionId,
    amount: Number(amount),
    currency: 'INR',
    purpose: 'School Fee Payment',
    callbackUrl,
    customer: {
      name: student.name,
      email: student.email,
      phone: student.phone,
      admissionNo: student.admissionNo
    }
  };

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/dynamic-qr/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    const error = new Error(data.message || 'Unable to create SMEpay dynamic QR');
    error.statusCode = 502;
    error.providerResponse = data;
    throw error;
  }

  return {
    providerOrderId: data.orderId || data.order_id || data.transactionRef || '',
    providerReferenceId: data.referenceId || data.reference_id || '',
    qrCodeData: normalizeQrData(data),
    raw: data
  };
};

const verifyWebhookSignature = ({ rawBody, signature }) => {
  const { webhookSecret } = getConfig();
  if (!signature || !rawBody) return false;

  const computed = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  const incoming = String(signature).trim();
  if (incoming.length !== computed.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(incoming));
};

module.exports = {
  createDynamicQr,
  verifyWebhookSignature,
  normalizeStatus
};