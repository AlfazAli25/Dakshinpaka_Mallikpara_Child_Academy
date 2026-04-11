import { SCHOOL_NAME } from '@/lib/school-config';

const normalizeText = (value) => String(value || '').trim();
const UPI_LINK_PREFIX = 'upi://pay?';
const UPI_ID_ENV_KEYS = [
  'NEXT_PUBLIC_UPI_ID',
  'NEXT_PUBLIC_SCHOOL_UPI_ID',
  'NEXT_PUBLIC_PAYMENT_UPI_ID',
  'NEXT_PUBLIC_SCHOOL_UPI'
];

const resolvePublicEnv = (keys = []) => {
  for (const key of keys) {
    const value = normalizeText(process.env[key]);
    if (value) {
      return value;
    }
  }

  return '';
};

const toNormalizedUpiLink = (value) => {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) {
    return '';
  }

  if (normalizedValue.toLowerCase().startsWith(UPI_LINK_PREFIX)) {
    return `${UPI_LINK_PREFIX}${normalizedValue.slice(UPI_LINK_PREFIX.length)}`;
  }

  try {
    const decoded = decodeURIComponent(normalizedValue);
    if (decoded.toLowerCase().startsWith(UPI_LINK_PREFIX)) {
      return `${UPI_LINK_PREFIX}${decoded.slice(UPI_LINK_PREFIX.length)}`;
    }
  } catch (_error) {
    // Ignore decode errors and return empty fallback below.
  }

  return '';
};

const mergeUpiParams = (params, { amount, note, transactionReference } = {}) => {
  const normalizedAmount = Number(amount);
  if (Number.isFinite(normalizedAmount) && normalizedAmount > 0) {
    params.set('am', normalizedAmount.toFixed(2));
  }

  const normalizedNote = normalizeText(note || UPI_DEFAULT_NOTE);
  if (normalizedNote) {
    params.set('tn', normalizedNote);
  }

  const normalizedReference = normalizeText(transactionReference);
  if (normalizedReference) {
    params.set('tr', normalizedReference);
  }

  return params;
};

let qrFallbackLinkCache = '';
let qrFallbackPromise = null;

export const UPI_ID = resolvePublicEnv(UPI_ID_ENV_KEYS);
export const UPI_PAYEE_NAME = normalizeText(resolvePublicEnv(['NEXT_PUBLIC_UPI_PAYEE_NAME']) || SCHOOL_NAME);
export const UPI_DEFAULT_NOTE = normalizeText(process.env.NEXT_PUBLIC_UPI_PAYMENT_NOTE || 'School Payment');
export const HAS_UPI_CONFIGURATION = Boolean(UPI_ID);

export const buildUpiPaymentLink = ({ amount, note, transactionReference } = {}) => {
  if (!HAS_UPI_CONFIGURATION) {
    return '';
  }

  const params = new URLSearchParams();
  params.set('pa', UPI_ID);
  params.set('pn', UPI_PAYEE_NAME || SCHOOL_NAME);
  params.set('cu', 'INR');

  return `${UPI_LINK_PREFIX}${mergeUpiParams(params, { amount, note, transactionReference }).toString()}`;
};

export const buildUpiPaymentLinkFromQr = ({ qrLink, amount, note, transactionReference } = {}) => {
  const normalizedQrLink = toNormalizedUpiLink(qrLink);
  if (!normalizedQrLink) {
    return '';
  }

  const queryPart = normalizedQrLink.slice(UPI_LINK_PREFIX.length);
  const params = new URLSearchParams(queryPart);
  if (!params.get('pa')) {
    return '';
  }

  if (!params.get('pn')) {
    params.set('pn', UPI_PAYEE_NAME || SCHOOL_NAME);
  }

  if (!params.get('cu')) {
    params.set('cu', 'INR');
  }

  return `${UPI_LINK_PREFIX}${mergeUpiParams(params, { amount, note, transactionReference }).toString()}`;
};

export const loadUpiLinkFromStaticQr = async () => {
  if (qrFallbackLinkCache) {
    return qrFallbackLinkCache;
  }

  if (typeof window === 'undefined' || typeof window.BarcodeDetector === 'undefined') {
    return '';
  }

  if (qrFallbackPromise) {
    return qrFallbackPromise;
  }

  qrFallbackPromise = (async () => {
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const response = await fetch('/static-payment-qr.svg', { cache: 'force-cache' });
      if (!response.ok) {
        return '';
      }

      const imageBlob = await response.blob();
      const bitmap = await createImageBitmap(imageBlob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;

      const context = canvas.getContext('2d');
      if (!context) {
        return '';
      }

      context.drawImage(bitmap, 0, 0);
      const decodedResults = await detector.detect(canvas);
      const firstValue = toNormalizedUpiLink(decodedResults?.[0]?.rawValue || '');

      if (firstValue) {
        qrFallbackLinkCache = firstValue;
      }

      return firstValue;
    } catch (_error) {
      return '';
    } finally {
      qrFallbackPromise = null;
    }
  })();

  return qrFallbackPromise;
};
