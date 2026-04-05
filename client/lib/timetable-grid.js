export const TIMETABLE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const TIMETABLE_PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

export const toId = (value) => String(value?._id || value || '');

const getDayRank = (day) => {
  const index = TIMETABLE_DAYS.indexOf(String(day || '').trim());
  return index >= 0 ? index : 999;
};

export const sortTimetableRows = (rows = []) => {
  const cloned = Array.isArray(rows) ? [...rows] : [];

  cloned.sort((left, right) => {
    const dayDiff = getDayRank(left?.day) - getDayRank(right?.day);
    if (dayDiff !== 0) {
      return dayDiff;
    }

    const leftPeriod = Number(left?.periodNumber || 0);
    const rightPeriod = Number(right?.periodNumber || 0);
    if (leftPeriod !== rightPeriod) {
      return leftPeriod - rightPeriod;
    }

    const leftStart = String(left?.startTime || '');
    const rightStart = String(right?.startTime || '');
    return leftStart.localeCompare(rightStart);
  });

  return cloned;
};

export const buildTimetableGrid = (rows = [], periods = TIMETABLE_PERIODS) => {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const normalizedPeriods = Array.isArray(periods) && periods.length > 0 ? periods : TIMETABLE_PERIODS;

  const lookup = new Map();
  normalizedRows.forEach((row) => {
    const key = `${String(row?.day || '')}::${Number(row?.periodNumber || 0)}`;
    if (!lookup.has(key)) {
      lookup.set(key, []);
    }
    lookup.get(key).push(row);
  });

  return TIMETABLE_DAYS.map((day) => ({
    day,
    cells: normalizedPeriods.map((periodNumber) => {
      const key = `${day}::${periodNumber}`;
      const items = sortTimetableRows(lookup.get(key) || []);
      return {
        day,
        periodNumber,
        items
      };
    })
  }));
};