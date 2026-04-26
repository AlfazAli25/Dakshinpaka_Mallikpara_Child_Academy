const Fee = require('../models/fee.model');
const Student = require('../models/student.model');
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

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

const DEFAULT_OVERDUE_DAYS = toPositiveInt(process.env.FEE_REMINDER_OVERDUE_DAYS, 30);
const DEFAULT_MAX_STUDENTS_PER_RUN = Math.min(
  toPositiveInt(process.env.FEE_REMINDER_MAX_STUDENTS_PER_RUN, 300),
  2000
);

const toAmount = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.round(numeric * 100) / 100;
};

const getThresholdDate = ({ now = new Date(), overdueDays = DEFAULT_OVERDUE_DAYS }) =>
  new Date(now.getTime() - overdueDays * 24 * 60 * 60 * 1000);

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

const buildReminderBody = ({ admissionNo, overdueMonthKey, totalPendingAmount }) => {
  const monthLabel = formatMonthLabel(overdueMonthKey);
  const pendingAmountLabel = formatCurrency(totalPendingAmount);

  return `Student ${admissionNo}: Your school fee has been pending for over a month (since ${monthLabel}). Total pending amount is Rs ${pendingAmountLabel}. Please complete payment to avoid further action.`;
};

const groupOverdueRowsByStudent = (rows = []) => {
  const grouped = new Map();

  for (const row of rows) {
    const studentId = String(row?.studentId || '').trim();
    if (!studentId) {
      continue;
    }

    if (!grouped.has(studentId)) {
      grouped.set(studentId, {
        oldestDueDate: row.dueDate || null,
        overdueMonthKey: row.monthKey || '',
        overdueMonthsCount: 1
      });
      continue;
    }

    const existing = grouped.get(studentId);
    existing.overdueMonthsCount += 1;

    const existingDueTime = existing.oldestDueDate ? new Date(existing.oldestDueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const candidateDueTime = row?.dueDate ? new Date(row.dueDate).getTime() : Number.MAX_SAFE_INTEGER;

    if (candidateDueTime < existingDueTime) {
      existing.oldestDueDate = row.dueDate || existing.oldestDueDate;
      existing.overdueMonthKey = row.monthKey || existing.overdueMonthKey;
    }
  }

  return grouped;
};

const buildPendingSummaryByStudent = (rows = []) => {
  const grouped = new Map();

  for (const row of rows) {
    const studentId = String(row?.studentId || '').trim();
    if (!studentId) {
      continue;
    }

    const current = grouped.get(studentId) || {
      totalPendingAmount: 0
    };

    current.totalPendingAmount = toAmount(current.totalPendingAmount + calculateFeePendingAmount(row));
    grouped.set(studentId, current);
  }

  return grouped;
};

const runDailyFeePendingReminders = async ({
  reason = 'daily-fee-reminder',
  dryRun = false,
  overdueDays = DEFAULT_OVERDUE_DAYS,
  limitStudents = DEFAULT_MAX_STUDENTS_PER_RUN
} = {}) => {
  const effectiveOverdueDays = toPositiveInt(overdueDays, DEFAULT_OVERDUE_DAYS);
  const effectiveLimit = Math.min(
    toPositiveInt(limitStudents, DEFAULT_MAX_STUDENTS_PER_RUN),
    DEFAULT_MAX_STUDENTS_PER_RUN
  );

  await ensureMonthlyFeesForAllStudents();

  const thresholdDate = getThresholdDate({ overdueDays: effectiveOverdueDays });
  const overdueRows = await Fee.find({
    status: { $in: PENDING_STATUS_VALUES },
    dueDate: { $lte: thresholdDate }
  })
    .select('studentId monthKey dueDate amountDue amountPaid status')
    .sort({ dueDate: 1, createdAt: 1 })
    .lean();

  const groupedOverdue = groupOverdueRowsByStudent(overdueRows);
  const candidateStudentIds = Array.from(groupedOverdue.keys()).slice(0, effectiveLimit);

  if (candidateStudentIds.length === 0) {
    const emptySummary = {
      reason,
      dryRun,
      thresholdDate,
      overdueDays: effectiveOverdueDays,
      scannedOverdueRows: overdueRows.length,
      eligibleStudents: 0,
      notifiedStudents: 0,
      studentsWithoutToken: 0,
      failedStudents: 0,
      reminders: []
    };

    logInfo('daily_fee_reminder_completed', emptySummary);
    return emptySummary;
  }

  const allPendingRows = await Fee.find({
    studentId: { $in: candidateStudentIds },
    status: { $in: PENDING_STATUS_VALUES }
  })
    .select('studentId amountDue amountPaid')
    .lean();

  const pendingSummaryByStudent = buildPendingSummaryByStudent(allPendingRows);
  const studentRows = await Student.find({ _id: { $in: candidateStudentIds } })
    .select('_id userId admissionNo')
    .lean();

  const studentById = new Map(studentRows.map((row) => [String(row._id), row]));

  const reminderLogs = [];
  let notifiedStudents = 0;
  let studentsWithoutToken = 0;
  let failedStudents = 0;

  for (const studentId of candidateStudentIds) {
    const student = studentById.get(studentId);
    const overdueInfo = groupedOverdue.get(studentId);
    const pendingSummary = pendingSummaryByStudent.get(studentId) || { totalPendingAmount: 0 };

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

    const payload = {
      title: DEFAULT_NOTIFICATION_TITLE,
      body: buildReminderBody({
        admissionNo: student.admissionNo,
        overdueMonthKey: overdueInfo?.overdueMonthKey,
        totalPendingAmount: pendingSummary.totalPendingAmount
      }),
      icon: DEFAULT_NOTIFICATION_ICON,
      clickAction: DEFAULT_NOTIFICATION_CLICK_ACTION
    };

    if (dryRun) {
      reminderLogs.push({
        studentId,
        userId: String(student.userId),
        admissionNo: student.admissionNo,
        overdueMonthKey: overdueInfo?.overdueMonthKey || '',
        overdueMonthsCount: overdueInfo?.overdueMonthsCount || 0,
        totalPendingAmount: pendingSummary.totalPendingAmount,
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

      if (Number(sendResult?.sentCount || 0) > 0) {
        notifiedStudents += 1;
      }

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
    thresholdDate,
    overdueDays: effectiveOverdueDays,
    scannedOverdueRows: overdueRows.length,
    eligibleStudents: candidateStudentIds.length,
    notifiedStudents,
    studentsWithoutToken,
    failedStudents,
    reminders: reminderLogs
  };

  logInfo('daily_fee_reminder_completed', {
    reason,
    dryRun,
    overdueDays: effectiveOverdueDays,
    scannedOverdueRows: overdueRows.length,
    eligibleStudents: candidateStudentIds.length,
    notifiedStudents,
    studentsWithoutToken,
    failedStudents
  });

  return summary;
};

module.exports = {
  runDailyFeePendingReminders
};
