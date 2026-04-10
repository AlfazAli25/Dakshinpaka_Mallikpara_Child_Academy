const toValidDate = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const getScheduleEndTimestamp = (rows = []) => {
  const normalizedRows = Array.isArray(rows) ? rows : [];

  const endTimes = normalizedRows
    .map((item) => toValidDate(item?.endDate)?.getTime() || 0)
    .filter((value) => value > 0);

  if (endTimes.length === 0) {
    return 0;
  }

  return Math.max(...endTimes);
};

const resolveExamCutoffDate = ({ exam = {}, admitCard = {} } = {}) => {
  const examScheduleEndMs = getScheduleEndTimestamp(exam?.schedule);
  if (examScheduleEndMs > 0) {
    return new Date(examScheduleEndMs);
  }

  const admitScheduleEndMs = getScheduleEndTimestamp(admitCard?.scheduleSnapshot);
  if (admitScheduleEndMs > 0) {
    return new Date(admitScheduleEndMs);
  }

  return (
    toValidDate(exam?.endDate) ||
    toValidDate(admitCard?.examEndDate) ||
    toValidDate(exam?.startDate) ||
    toValidDate(admitCard?.examStartDate) ||
    toValidDate(exam?.examDate) ||
    toValidDate(exam?.date) ||
    null
  );
};

const isExamCompletedForAdmitCard = ({ exam = {}, admitCard = {} } = {}) => {
  const normalizedStatus = String(exam?.status || '').trim().toLowerCase();
  if (normalizedStatus === 'completed') {
    return true;
  }

  const cutoffDate = resolveExamCutoffDate({ exam, admitCard });
  if (!cutoffDate) {
    return false;
  }

  return cutoffDate.getTime() <= Date.now();
};

module.exports = {
  isExamCompletedForAdmitCard,
  resolveExamCutoffDate
};
