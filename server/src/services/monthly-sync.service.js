const { ensureMonthlyFeesForAllStudents } = require('./monthly-fee-ledger.service');
const { ensureMonthlyPayrollForAllTeachers } = require('./monthly-payroll-ledger.service');
const { logError, logInfo } = require('../utils/logger');

let inFlightSyncPromise = null;
let lastCompletedMonthKey = '';
let schedulerTimeoutId = null;

const MONTHLY_SYNC_TIMEZONE_OFFSET_MINUTES = Number(process.env.MONTHLY_SYNC_TIMEZONE_OFFSET_MINUTES || 330);
const MONTHLY_SYNC_TIMEZONE_OFFSET_MS = MONTHLY_SYNC_TIMEZONE_OFFSET_MINUTES * 60 * 1000;

const getMonthKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}`;
};

const toValidDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
};

const toConfiguredTimezoneDate = (value = new Date()) => {
  const date = toValidDate(value);
  return new Date(date.getTime() + MONTHLY_SYNC_TIMEZONE_OFFSET_MS);
};

const isMonthlyBoundaryInConfiguredTimezone = (value = new Date()) => {
  const timezoneDate = toConfiguredTimezoneDate(value);

  // The first hour of day 1 in configured timezone is considered boundary window.
  return timezoneDate.getUTCDate() === 1 && timezoneDate.getUTCHours() === 0;
};

const runMonthlySync = async ({ reason = 'manual', force = false, anchorDate = new Date() } = {}) => {
  const normalizedAnchorDate = toConfiguredTimezoneDate(anchorDate);
  const targetMonthKey = getMonthKey(normalizedAnchorDate);

  if (!force && targetMonthKey && lastCompletedMonthKey === targetMonthKey) {
    return {
      skipped: true,
      reason,
      monthKey: targetMonthKey
    };
  }

  if (inFlightSyncPromise) {
    return inFlightSyncPromise;
  }

  inFlightSyncPromise = (async () => {
    const startedAt = Date.now();

    await Promise.all([
      ensureMonthlyFeesForAllStudents({ anchorDate: normalizedAnchorDate }),
      ensureMonthlyPayrollForAllTeachers({ anchorDate: normalizedAnchorDate })
    ]);

    if (targetMonthKey) {
      lastCompletedMonthKey = targetMonthKey;
    }

    const durationMs = Date.now() - startedAt;
    logInfo('monthly_sync_completed', {
      reason,
      monthKey: targetMonthKey,
      durationMs
    });

    return {
      skipped: false,
      reason,
      monthKey: targetMonthKey,
      durationMs
    };
  })()
    .catch((error) => {
      logError('monthly_sync_failed', {
        reason,
        monthKey: targetMonthKey,
        message: error?.message || 'Unknown monthly sync error'
      });

      throw error;
    })
    .finally(() => {
      inFlightSyncPromise = null;
    });

  return inFlightSyncPromise;
};

const getNextMonthlyRunAt = (now = new Date()) => {
  const currentTzDate = toConfiguredTimezoneDate(now);

  // Build next month start in timezone-aligned UTC space.
  const nextTimezoneMonthStart = new Date(Date.UTC(
    currentTzDate.getUTCFullYear(),
    currentTzDate.getUTCMonth() + 1,
    1,
    0,
    0,
    0,
    0
  ));

  // Convert back to actual UTC/runtime time.
  return new Date(nextTimezoneMonthStart.getTime() - MONTHLY_SYNC_TIMEZONE_OFFSET_MS);
};

const scheduleNextRun = () => {
  const nextRunAt = getNextMonthlyRunAt();
  const delayMs = Math.max(nextRunAt.getTime() - Date.now(), 1000);

  schedulerTimeoutId = setTimeout(async () => {
    try {
      await runMonthlySync({ reason: 'scheduler-monthly-midnight' });
    } catch (_error) {
      // Error is already logged in runMonthlySync.
    } finally {
      scheduleNextRun();
    }
  }, delayMs);

  if (typeof schedulerTimeoutId?.unref === 'function') {
    schedulerTimeoutId.unref();
  }

  logInfo('monthly_sync_scheduler_scheduled', {
    nextRunAt: nextRunAt.toISOString(),
    delayMs,
    timezoneOffsetMinutes: MONTHLY_SYNC_TIMEZONE_OFFSET_MINUTES
  });
};

const startMonthlySyncScheduler = async ({ runOnStartup = true } = {}) => {
  if (schedulerTimeoutId) {
    return;
  }

  if (runOnStartup) {
    try {
      await runMonthlySync({ reason: 'server-startup-catchup' });
    } catch (_error) {
      // Error is already logged in runMonthlySync.
    }
  }

  scheduleNextRun();
};

const stopMonthlySyncScheduler = () => {
  if (!schedulerTimeoutId) {
    return;
  }

  clearTimeout(schedulerTimeoutId);
  schedulerTimeoutId = null;
};

module.exports = {
  runMonthlySync,
  isMonthlyBoundaryInConfiguredTimezone,
  startMonthlySyncScheduler,
  stopMonthlySyncScheduler
};