const Fee = require('../models/fee.model');
const Student = require('../models/student.model');
const FeeReminderNotification = require('../models/fee-reminder-notification.model');
const {
  ensureMonthlyFeesForAllStudents,
  calculateFeePendingAmount
} = require('./monthly-fee-ledger.service');
const pushNotificationService = require('./push-notification.service');
const { logError, logInfo } = require('../utils/logger');

const PENDING_STATUS_VALUES = ['PENDING', 'PARTIALLY PAID'];
const DEFAULT_NOTIFICATION_TITLE = 'Fee Reminder';
const DEFAULT_NOTIFICATION_ICON = '/icons/icon-192.png';
const DEFAULT_NOTIFICATION_CLICK_ACTION = '/student/fees';
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

const toAmount = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.round(numeric * 100) / 100;
};

const toPositiveAmount = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return toAmount(fallback);
  }

  return toAmount(parsed);
};

const DEFAULT_MIN_PENDING_AMOUNT = toPositiveAmount(process.env.FEE_REMINDER_MIN_PENDING_AMOUNT, 200);
const DEFAULT_REMINDER_INTERVAL_DAYS = toPositiveInt(process.env.FEE_REMINDER_INTERVAL_DAYS, 2);
const DEFAULT_MAX_STUDENTS_PER_RUN = Math.min(
  toPositiveInt(process.env.FEE_REMINDER_MAX_STUDENTS_PER_RUN, 300),
  2000
);

const parseMonthKeyToDate = (monthKey) => {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, 1));
};

const formatMonthLabel = (monthKey) => {
  const date = parseMonthKeyToDate(monthKey);
  if (!date) {
    return 'previous month';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
};

const formatCurrency = (value) => {
  const amount = toAmount(value);
  if (Number.isInteger(amount)) {
    return String(amount);
  }

  return amount.toFixed(2);
};

const asDate = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const shouldSkipForReminderInterval = ({ lastSentAt, now, reminderIntervalMs }) => {
  const lastSentDate = asDate(lastSentAt);
  if (!lastSentDate) {
    return false;
  }

  return now.getTime() - lastSentDate.getTime() < reminderIntervalMs;
};

const buildReminderBody = ({ admissionNo, oldestPendingMonthKey, totalPendingAmount, minimumPendingAmount }) => {
  const monthLabel = formatMonthLabel(oldestPendingMonthKey);
  const pendingAmountLabel = formatCurrency(totalPendingAmount);
  const minimumPendingLabel = formatCurrency(minimumPendingAmount);

  return `Student ${admissionNo}: Your pending school fee is Rs ${pendingAmountLabel} (from ${monthLabel}). Since your dues are above Rs ${minimumPendingLabel}, please clear the amount as soon as possible.`;
};

const buildPendingSummaryByStudent = (rows = []) => {
  const grouped = new Map();

  for (const row of rows) {
    const studentId = String(row?.studentId || '').trim();
    if (!studentId) {
      continue;
    }

    const pendingAmount = toAmount(calculateFeePendingAmount(row));
    if (pendingAmount <= 0) {
      continue;
    }

    if (!grouped.has(studentId)) {
      grouped.set(studentId, {
        oldestPendingDueDate: row.dueDate || null,
        oldestPendingMonthKey: row.monthKey || '',
        pendingMonthsCount: 1,
        totalPendingAmount: pendingAmount
      });
      continue;
    }

    const existing = grouped.get(studentId);
    existing.totalPendingAmount = toAmount(existing.totalPendingAmount + pendingAmount);
    existing.pendingMonthsCount += 1;

    const existingDueDate = asDate(existing.oldestPendingDueDate);
    const candidateDueDate = asDate(row?.dueDate);

    if (!existingDueDate || (candidateDueDate && candidateDueDate.getTime() < existingDueDate.getTime())) {
      existing.oldestPendingDueDate = row.dueDate || existing.oldestPendingDueDate;
      existing.oldestPendingMonthKey = row.monthKey || existing.oldestPendingMonthKey;
    }
  }

  return grouped;
};

const runDailyFeePendingReminders = async ({
  reason = 'daily-fee-reminder',
  dryRun = false,
  limitStudents = DEFAULT_MAX_STUDENTS_PER_RUN,
  minPendingAmount = DEFAULT_MIN_PENDING_AMOUNT,
  reminderIntervalDays = DEFAULT_REMINDER_INTERVAL_DAYS
} = {}) => {
  const effectiveLimit = Math.min(
    toPositiveInt(limitStudents, DEFAULT_MAX_STUDENTS_PER_RUN),
    DEFAULT_MAX_STUDENTS_PER_RUN
  );
  const effectiveMinPendingAmount = toPositiveAmount(minPendingAmount, DEFAULT_MIN_PENDING_AMOUNT);
  const effectiveReminderIntervalDays = toPositiveInt(reminderIntervalDays, DEFAULT_REMINDER_INTERVAL_DAYS);
  const reminderIntervalMs = effectiveReminderIntervalDays * DAY_IN_MS;
  const now = new Date();

  await ensureMonthlyFeesForAllStudents();

  const pendingRows = await Fee.find({ status: { $in: PENDING_STATUS_VALUES } })
    .select('studentId monthKey dueDate amountDue amountPaid status')
    .sort({ dueDate: 1, createdAt: 1 })
    .lean();

  const pendingSummaryByStudent = buildPendingSummaryByStudent(pendingRows);
  const candidateEntries = Array.from(pendingSummaryByStudent.entries())
    .filter(([, summary]) => summary.totalPendingAmount > effectiveMinPendingAmount)
    .slice(0, effectiveLimit);

  const candidateStudentIds = candidateEntries.map(([studentId]) => studentId);

  if (candidateStudentIds.length === 0) {
    const emptySummary = {
      reason,
      dryRun,
      minPendingAmount: effectiveMinPendingAmount,
      reminderIntervalDays: effectiveReminderIntervalDays,
      scannedPendingRows: pendingRows.length,
      eligibleStudents: 0,
      notifiedStudents: 0,
      studentsWithoutToken: 0,
      skippedByInterval: 0,
      failedStudents: 0,
      reminders: []
    };

    logInfo('daily_fee_reminder_completed', emptySummary);
    return emptySummary;
  }

  const [studentRows, reminderStateRows] = await Promise.all([
    Student.find({ _id: { $in: candidateStudentIds } })
      .select('_id userId admissionNo')
      .lean(),
    FeeReminderNotification.find({
      studentId: { $in: candidateStudentIds }
    })
      .select('studentId lastSentAt lastPendingAmount lastOverdueMonthKey')
      .lean()
  ]);

  const studentById = new Map(studentRows.map((row) => [String(row._id), row]));
  const reminderStateByStudent = new Map(
    reminderStateRows.map((row) => [String(row.studentId), row])
  );

  const reminderLogs = [];
  let notifiedStudents = 0;
  let studentsWithoutToken = 0;
  let skippedByInterval = 0;
  let failedStudents = 0;

  for (const [studentId, pendingSummary] of candidateEntries) {
    const student = studentById.get(studentId);
    const reminderState = reminderStateByStudent.get(studentId);
    const lastSentAt = asDate(reminderState?.lastSentAt);

    if (!student || !student.userId) {
      failedStudents += 1;
      reminderLogs.push({
        studentId,
        admissionNo: student?.admissionNo || '',
        status: 'FAILED',
        reason: 'Student or student userId not found'
      });
      continue;
    }

    if (shouldSkipForReminderInterval({ lastSentAt, now, reminderIntervalMs })) {
      skippedByInterval += 1;
      reminderLogs.push({
        studentId,
        userId: String(student.userId),
        admissionNo: student.admissionNo,
        status: 'SKIPPED_INTERVAL',
        lastSentAt,
        nextEligibleAt: new Date(lastSentAt.getTime() + reminderIntervalMs),
        totalPendingAmount: pendingSummary.totalPendingAmount
      });
      continue;
    }

    const payload = {
      title: DEFAULT_NOTIFICATION_TITLE,
      body: buildReminderBody({
        admissionNo: student.admissionNo,
        oldestPendingMonthKey: pendingSummary?.oldestPendingMonthKey,
        totalPendingAmount: pendingSummary.totalPendingAmount,
        minimumPendingAmount: effectiveMinPendingAmount
      }),
      icon: DEFAULT_NOTIFICATION_ICON,
      clickAction: DEFAULT_NOTIFICATION_CLICK_ACTION
    };

    if (dryRun) {
      reminderLogs.push({
        studentId,
        userId: String(student.userId),
        admissionNo: student.admissionNo,
        oldestPendingMonthKey: pendingSummary?.oldestPendingMonthKey || '',
        pendingMonthsCount: pendingSummary?.pendingMonthsCount || 0,
        totalPendingAmount: pendingSummary.totalPendingAmount,
        wouldBeSkippedByInterval: false,
        status: 'DRY_RUN'
      });
      continue;
    }

    try {
      const sendResult = await pushNotificationService.sendNotificationToUser({
        userId: String(student.userId),
        payload
      });

      if (Number(sendResult?.totalTokens || 0) <= 0) {
        studentsWithoutToken += 1;
        reminderLogs.push({
          studentId,
          userId: String(student.userId),
          admissionNo: student.admissionNo,
          status: 'NO_TOKEN',
          totalTokens: sendResult?.totalTokens || 0
        });
        continue;
      }

      if (Number(sendResult?.sentCount || 0) <= 0) {
        failedStudents += 1;
        reminderLogs.push({
          studentId,
          userId: String(student.userId),
          admissionNo: student.admissionNo,
          status: 'FAILED_DELIVERY',
          totalTokens: sendResult?.totalTokens || 0,
          sentCount: sendResult?.sentCount || 0,
          failedCount: sendResult?.failedCount || 0
        });
        continue;
      }

      notifiedStudents += 1;

      await FeeReminderNotification.findOneAndUpdate(
        { studentId },
        {
          $set: {
            lastSentAt: now,
            lastPendingAmount: pendingSummary.totalPendingAmount,
            lastOverdueMonthKey: pendingSummary?.oldestPendingMonthKey || ''
          }
        },
        {
          upsert: true,
          setDefaultsOnInsert: true,
          new: true
        }
      );

      reminderLogs.push({
        studentId,
        userId: String(student.userId),
        admissionNo: student.admissionNo,
        status: 'SENT',
        totalTokens: sendResult?.totalTokens || 0,
        sentCount: sendResult?.sentCount || 0,
        failedCount: sendResult?.failedCount || 0,
        removedInvalidTokens: sendResult?.removedInvalidTokens || 0
      });
    } catch (error) {
      failedStudents += 1;
      reminderLogs.push({
        studentId,
        userId: String(student.userId),
        admissionNo: student.admissionNo,
        status: 'FAILED',
        reason: error?.message || 'Unknown notification delivery error'
      });

      logError('daily_fee_reminder_student_failed', {
        studentId,
        userId: String(student.userId),
        reason: error?.message || 'Unknown notification delivery error'
      });
    }
  }

  const summary = {
    reason,
    dryRun,
    minPendingAmount: effectiveMinPendingAmount,
    reminderIntervalDays: effectiveReminderIntervalDays,
    scannedPendingRows: pendingRows.length,
    eligibleStudents: candidateStudentIds.length,
    notifiedStudents,
    studentsWithoutToken,
    skippedByInterval,
    failedStudents,
    reminders: reminderLogs
  };

  logInfo('daily_fee_reminder_completed', {
    reason,
    dryRun,
    minPendingAmount: effectiveMinPendingAmount,
    reminderIntervalDays: effectiveReminderIntervalDays,
    scannedPendingRows: pendingRows.length,
    eligibleStudents: candidateStudentIds.length,
    notifiedStudents,
    studentsWithoutToken,
    skippedByInterval,
    failedStudents
  });

  return summary;
};

module.exports = {
  runDailyFeePendingReminders
};
