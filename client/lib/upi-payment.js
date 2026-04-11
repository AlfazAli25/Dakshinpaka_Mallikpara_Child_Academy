import { SCHOOL_NAME } from '@/lib/school-config';

const normalizeText = (value) => String(value || '').trim();

export const UPI_ID = normalizeText(process.env.NEXT_PUBLIC_UPI_ID);
export const UPI_PAYEE_NAME = normalizeText(process.env.NEXT_PUBLIC_UPI_PAYEE_NAME || SCHOOL_NAME);
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

  return `upi://pay?${params.toString()}`;
};
