const sanitizeText = (value) => String(value || '').trim();

const sanitizeReference = (value = '') =>
	sanitizeText(value)
		.replace(/\s+/g, '')
		.replace(/[^A-Za-z0-9._-]/g, '')
		.slice(0, 35);

const toAmount = (value) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return '';
	}

	return parsed.toFixed(2);
};

export const createDefaultUpiReference = (prefix = 'DMCA') => {
	const stamp = Date.now().toString(36).toUpperCase();
	return sanitizeReference(`${prefix}${stamp}`) || `${prefix}PAY`;
};

export const buildUpiPaymentLink = ({
	upiId,
	payeeName,
	amount,
	transactionReference,
	note
} = {}) => {
	const normalizedUpiId = sanitizeText(upiId);
	if (!normalizedUpiId) {
		return '';
	}

	const normalizedPayeeName = sanitizeText(payeeName) || 'School Payment';
	const normalizedAmount = toAmount(amount);
	const normalizedReference = sanitizeReference(transactionReference);
	const normalizedNote = sanitizeText(note) || 'School Fee Payment';

	const params = new URLSearchParams();
	params.set('pa', normalizedUpiId);
	params.set('pn', normalizedPayeeName);
	params.set('cu', 'INR');

	if (normalizedAmount) {
		params.set('am', normalizedAmount);
	}

	if (normalizedReference) {
		params.set('tr', normalizedReference);
		params.set('tid', normalizedReference);
	}

	params.set('tn', normalizedNote);

	return `upi://pay?${params.toString()}`;
};

export const launchUpiPayment = (upiLink) => {
	const normalizedLink = sanitizeText(upiLink);
	if (!normalizedLink || typeof window === 'undefined') {
		return false;
	}

	window.location.assign(normalizedLink);
	return true;
};
