const BELOW_TWENTY = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen'
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety'
];

const INDIAN_SCALES = [
  { value: 10000000, label: 'Crore' },
  { value: 100000, label: 'Lakh' },
  { value: 1000, label: 'Thousand' }
];

const toValidAmount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }

  return Number(numeric.toFixed(2));
};

const toWordsBelowHundred = (number) => {
  if (number < 20) {
    return BELOW_TWENTY[number];
  }

  const ten = Math.floor(number / 10);
  const remainder = number % 10;
  if (remainder === 0) {
    return TENS[ten];
  }

  return `${TENS[ten]} ${BELOW_TWENTY[remainder]}`;
};

const toWordsBelowThousand = (number) => {
  if (number < 100) {
    return toWordsBelowHundred(number);
  }

  const hundred = Math.floor(number / 100);
  const remainder = number % 100;
  if (remainder === 0) {
    return `${BELOW_TWENTY[hundred]} Hundred`;
  }

  return `${BELOW_TWENTY[hundred]} Hundred ${toWordsBelowHundred(remainder)}`;
};

const numberToWordsIndian = (value) => {
  const number = Math.floor(Math.max(0, Number(value) || 0));
  if (number === 0) {
    return 'Zero';
  }

  let remainder = number;
  const words = [];

  for (const scale of INDIAN_SCALES) {
    if (remainder >= scale.value) {
      const scaledValue = Math.floor(remainder / scale.value);
      words.push(`${numberToWordsIndian(scaledValue)} ${scale.label}`);
      remainder %= scale.value;
    }
  }

  if (remainder > 0) {
    words.push(toWordsBelowThousand(remainder));
  }

  return words.join(' ').trim();
};

const amountToWordsINR = (amount) => {
  const roundedAmount = toValidAmount(amount);

  let rupees = Math.floor(roundedAmount);
  let paise = Math.round((roundedAmount - rupees) * 100);
  if (paise === 100) {
    rupees += 1;
    paise = 0;
  }

  const rupeeWords = `${numberToWordsIndian(rupees)} Rupees`;
  if (paise === 0) {
    return `${rupeeWords} Only`;
  }

  return `${rupeeWords} and ${numberToWordsIndian(paise)} Paise Only`;
};

module.exports = { amountToWordsINR };
