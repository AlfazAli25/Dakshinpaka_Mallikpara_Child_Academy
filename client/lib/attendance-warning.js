export const ATTENDANCE_WARNING_THRESHOLD = 60;

export const parseAttendancePercentage = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  const matched = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!matched) {
    return null;
  }

  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

export const isAttendanceLow = (value, threshold = ATTENDANCE_WARNING_THRESHOLD) => {
  const parsed = parseAttendancePercentage(value);
  if (parsed === null) {
    return false;
  }

  return parsed < threshold;
};

export const isAttendanceLabel = (label) => {
  const normalized = String(label || '').toLowerCase();
  return normalized.includes('attendance') || String(label || '').includes('উপস্থিতি');
};

export const isAttendanceKey = (key) => {
  const normalized = String(key || '').toLowerCase();
  return normalized.includes('attendance') || normalized.includes('attendence');
};
