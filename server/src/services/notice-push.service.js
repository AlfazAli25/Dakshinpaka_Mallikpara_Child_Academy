const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');
const pushNotificationService = require('./push-notification.service');
const { logInfo } = require('../utils/logger');

const DEFAULT_NOTIFICATION_TITLE = 'School Notice';
const DEFAULT_NOTIFICATION_ICON = '/icons/icon-192.png';
const DEFAULT_CLICK_ACTION = '/';

const toId = (value) => String(value?._id || value || '').trim();

const uniqueIds = (values = []) => {
  const output = [];
  const seen = new Set();

  for (const value of Array.isArray(values) ? values : []) {
    const normalized = toId(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
  }

  return output;
};

const toAmount = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.round(numeric * 100) / 100;
};

const formatCurrency = (value) => {
  const amount = toAmount(value);
  if (Number.isInteger(amount)) {
    return String(amount);
  }

  return amount.toFixed(2);
};

const truncate = (value, maxLength) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }

  if (!Number.isInteger(maxLength) || maxLength <= 0) {
    return text;
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(maxLength - 3, 1)).trim()}...`;
};

const formatDueDate = (value) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
};

const buildNoticeBody = ({ notice = {} } = {}) => {
  const description = truncate(notice?.description, 150);
  const noticeType = String(notice?.noticeType || '').trim();

  if (noticeType !== 'Payment') {
    return description || 'A new notice has been published.';
  }

  const amountLabel = formatCurrency(notice?.amount);
  const dueDateLabel = formatDueDate(notice?.dueDate);
  const paymentMeta = dueDateLabel
    ? ` Amount due: Rs ${amountLabel}. Due date: ${dueDateLabel}.`
    : ` Amount due: Rs ${amountLabel}.`;

  return truncate(`${description || 'A payment notice has been published.'}${paymentMeta}`, 220);
};

const resolveNoticeClickAction = ({ notice = {} } = {}) => {
  const actionPath = String(notice?.actionPath || '').trim();
  if (actionPath.startsWith('/')) {
    return actionPath;
  }

  const recipientRole = String(notice?.recipientRole || 'student').trim().toLowerCase();
  const noticeType = String(notice?.noticeType || '').trim();
  const noticeId = toId(notice?._id);

  if (noticeType === 'Payment' && noticeId) {
    return `/student/payment/${noticeId}`;
  }

  if (recipientRole === 'teacher') {
    return '/teacher/dashboard';
  }

  if (recipientRole === 'student') {
    return '/student/dashboard';
  }

  return DEFAULT_CLICK_ACTION;
};

const collectStudentRecipientUserIds = async ({ classIds = [], studentIds = [] } = {}) => {
  const normalizedClassIds = uniqueIds(classIds);
  const normalizedStudentIds = uniqueIds(studentIds);

  const filter = {};
  if (normalizedStudentIds.length > 0) {
    filter._id = { $in: normalizedStudentIds };
  }

  if (normalizedClassIds.length > 0) {
    filter.classId = { $in: normalizedClassIds };
  }

  const students = await Student.find(filter)
    .select('userId')
    .lean();

  return uniqueIds(students.map((item) => item?.userId));
};

const collectTeacherRecipientUserIds = async ({ classIds = [] } = {}) => {
  const normalizedClassIds = uniqueIds(classIds);
  const filter = {};

  if (normalizedClassIds.length > 0) {
    filter.classIds = { $in: normalizedClassIds };
  }

  const teachers = await Teacher.find(filter)
    .select('userId')
    .lean();

  return uniqueIds(teachers.map((item) => item?.userId));
};

const resolveRecipientUserIds = async ({ notice = {} } = {}) => {
  const recipientRole = String(notice?.recipientRole || 'student').trim().toLowerCase();
  const classIds = uniqueIds(notice?.classIds || []);
  const studentIds = uniqueIds(notice?.studentIds || []);

  if (recipientRole === 'teacher') {
    return collectTeacherRecipientUserIds({ classIds });
  }

  if (recipientRole === 'all') {
    const [studentUserIds, teacherUserIds] = await Promise.all([
      collectStudentRecipientUserIds({ classIds, studentIds }),
      collectTeacherRecipientUserIds({ classIds })
    ]);

    return uniqueIds([...studentUserIds, ...teacherUserIds]);
  }

  return collectStudentRecipientUserIds({ classIds, studentIds });
};

const sendNoticePushNotifications = async ({ notice }) => {
  const normalizedNotice = notice?.toObject ? notice.toObject() : notice || {};
  const noticeId = toId(normalizedNotice?._id);
  const status = String(normalizedNotice?.status || 'Active').trim();

  if (!noticeId || status !== 'Active') {
    return {
      noticeId,
      recipientRole: String(normalizedNotice?.recipientRole || '').trim().toLowerCase(),
      skipped: true,
      reason: !noticeId ? 'NOTICE_ID_MISSING' : 'NOTICE_NOT_ACTIVE',
      targetUsers: 0,
      usersWithToken: 0,
      usersWithoutToken: 0,
      totalTokens: 0,
      sentCount: 0,
      failedCount: 0,
      removedInvalidTokens: 0
    };
  }

  const recipientRole = String(normalizedNotice?.recipientRole || 'student').trim().toLowerCase();
  const userIds = await resolveRecipientUserIds({ notice: normalizedNotice });

  const sendResult = await pushNotificationService.sendNotificationToUsers({
    userIds,
    payload: {
      title: truncate(normalizedNotice?.title, 80) || DEFAULT_NOTIFICATION_TITLE,
      body: buildNoticeBody({ notice: normalizedNotice }),
      icon: DEFAULT_NOTIFICATION_ICON,
      clickAction: resolveNoticeClickAction({ notice: normalizedNotice })
    }
  });

  const summary = {
    noticeId,
    recipientRole,
    skipped: false,
    ...sendResult
  };

  logInfo('notice_push_dispatch_completed', {
    noticeId,
    recipientRole,
    targetUsers: summary.targetUsers,
    usersWithToken: summary.usersWithToken,
    usersWithoutToken: summary.usersWithoutToken,
    sentCount: summary.sentCount,
    failedCount: summary.failedCount
  });

  return summary;
};

module.exports = {
  sendNoticePushNotifications
};
