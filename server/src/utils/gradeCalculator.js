const toFiniteNumber = (value) => Number(value);

const calculateGrade = (marksObtained, maxMarks) => {
  const obtained = toFiniteNumber(marksObtained);
  const total = toFiniteNumber(maxMarks);

  if (!Number.isFinite(obtained) || !Number.isFinite(total) || total <= 0) {
    const error = new Error('Marks obtained and max marks must be valid numbers, and max marks must be greater than zero');
    error.statusCode = 400;
    throw error;
  }

  const percentage = (obtained / total) * 100;

  if (percentage >= 90) {
    return { percentage: Number(percentage.toFixed(2)), grade: 'A+' };
  }
  if (percentage >= 80) {
    return { percentage: Number(percentage.toFixed(2)), grade: 'A' };
  }
  if (percentage >= 70) {
    return { percentage: Number(percentage.toFixed(2)), grade: 'B' };
  }
  if (percentage >= 60) {
    return { percentage: Number(percentage.toFixed(2)), grade: 'C' };
  }
  if (percentage >= 50) {
    return { percentage: Number(percentage.toFixed(2)), grade: 'D' };
  }

  return { percentage: Number(percentage.toFixed(2)), grade: 'F' };
};

module.exports = { calculateGrade };
