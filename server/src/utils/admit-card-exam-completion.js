const toValidDate = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const getScheduleStartTimestamp = (rows = []) => {
  const normalizedRows = Array.isArray(rows) ? rows : [];

  const startTimes = normalizedRows
    .map((item) => toValidDate(item?.startDate || item?.endDate)?.getTime() || 0)
    .filter((value) => value > 0);

  if (startTimes.length === 0) {
    return 0;
  }

  return Math.min(...startTimes);
};

const resolveExamCutoffDate = ({ exam = {}, admitCard = {} } = {}) => {
  const examScheduleStartMs = getScheduleStartTimestamp(exam?.schedule);
  if (examScheduleStartMs > 0) {
    return new Date(examScheduleStartMs);
  }

  const admitScheduleStartMs = getScheduleStartTimestamp(admitCard?.scheduleSnapshot);
  if (admitScheduleStartMs > 0) {
    return new Date(admitScheduleStartMs);
  }

  return (
    toValidDate(exam?.startDate) ||
    toValidDate(admitCard?.examStartDate) ||
    toValidDate(exam?.examDate) ||
    toValidDate(exam?.date) ||
    toValidDate(exam?.endDate) ||
    toValidDate(admitCard?.examEndDate) ||
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
