const QRCode = require('qrcode');

const BLANK_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9N6QAAAABJRU5ErkJggg==';

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

const generateQrCodeDataUri = async ({ payloads = [], width = 220 } = {}) => {
  const candidatePayloads = normalizePayloads(payloads);

  for (const candidate of candidatePayloads) {
    const payloadText = toPayloadText(candidate);
    if (!payloadText) {
      continue;
    }

    try {
      return await QRCode.toDataURL(payloadText, {
        type: 'image/png',
        width: Number(width) > 0 ? Number(width) : 220,
        margin: 1,
        errorCorrectionLevel: 'L'
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
