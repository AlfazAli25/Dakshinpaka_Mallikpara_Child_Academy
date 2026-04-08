const QRCode = require('qrcode');

const BLANK_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9N6QAAAABJRU5ErkJggg==';

const ALLOWED_ERROR_CORRECTION_LEVELS = new Set(['L', 'M', 'Q', 'H']);

const toPayloadText = (payload) => {
  if (payload === null || payload === undefined) {
    return '';
  }

  if (typeof payload === 'string') {
    return payload.trim();
  }

  try {
    return JSON.stringify(payload);
  } catch (_error) {
    return '';
  }
};

const normalizePayloads = (payloads = []) => {
  if (Array.isArray(payloads)) {
    return payloads;
  }

  return [payloads];
};

const toPositiveNumber = (value, fallback, minimum = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    return fallback;
  }

  return Math.floor(parsed);
};

const normalizeErrorCorrectionLevel = (value, fallback = 'M') => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();

  if (ALLOWED_ERROR_CORRECTION_LEVELS.has(normalized)) {
    return normalized;
  }

  return fallback;
};

const generateQrCodeDataUri = async ({ payloads = [], width = 220, margin = 2, errorCorrectionLevel = 'M' } = {}) => {
  const candidatePayloads = normalizePayloads(payloads);
  const normalizedWidth = toPositiveNumber(width, 220, 32);
  const normalizedMargin = toPositiveNumber(margin, 2, 1);
  const normalizedErrorCorrectionLevel = normalizeErrorCorrectionLevel(errorCorrectionLevel, 'M');

  for (const candidate of candidatePayloads) {
    const payloadText = toPayloadText(candidate);
    if (!payloadText) {
      continue;
    }

    try {
      return await QRCode.toDataURL(payloadText, {
        type: 'image/png',
        width: normalizedWidth,
        margin: normalizedMargin,
        errorCorrectionLevel: normalizedErrorCorrectionLevel,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (_error) {
      // Try next payload shape.
    }
  }

  return BLANK_PNG_DATA_URI;
};

module.exports = {
  generateQrCodeDataUri,
  BLANK_PNG_DATA_URI
};
