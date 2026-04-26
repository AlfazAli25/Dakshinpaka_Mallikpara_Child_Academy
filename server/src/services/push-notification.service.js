const UserNotificationToken = require('../models/user-notification-token.model');
const { getFirebaseMessaging } = require('../config/firebase-admin');

const DEFAULT_ICON = '/icons/icon-192.png';
const DEFAULT_CLICK_ACTION = '/';

const INVALID_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token'
]);

const toNotificationPayload = (payload = {}) => ({
  title: String(payload.title || '').trim() || 'School Notification',
  body: String(payload.body || '').trim() || 'You have a new update.',
  icon: String(payload.icon || '').trim() || DEFAULT_ICON,
  clickAction: String(payload.clickAction || '').trim() || DEFAULT_CLICK_ACTION
});

const uniqueTokens = (tokenDocs = []) => {
  const output = [];
  const seen = new Set();

  for (const item of tokenDocs) {
    const token = String(item?.token || '').trim();
    if (!token || seen.has(token)) {
      continue;
    }

    seen.add(token);
    output.push(token);
  }

  return output;
};

const removeInvalidTokens = async (tokens = []) => {
  if (!tokens.length) {
    return;
  }

  await UserNotificationToken.deleteMany({ token: { $in: tokens } });
};

const sendToTokens = async ({ tokenList = [], payload = {} }) => {
  const tokens = tokenList.filter(Boolean);

  if (!tokens.length) {
    return {
      totalTokens: 0,
      sentCount: 0,
      failedCount: 0,
      removedInvalidTokens: 0
    };
  }

  const normalizedPayload = toNotificationPayload(payload);

  const response = await getFirebaseMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title: normalizedPayload.title,
      body: normalizedPayload.body
    },
    data: {
      title: normalizedPayload.title,
      body: normalizedPayload.body,
      icon: normalizedPayload.icon,
      clickAction: normalizedPayload.clickAction
    },
    webpush: {
      fcmOptions: {
        link: normalizedPayload.clickAction
      },
      notification: {
        title: normalizedPayload.title,
        body: normalizedPayload.body,
        icon: normalizedPayload.icon
      }
    }
  });

  const invalidTokens = [];

  response.responses.forEach((item, index) => {
    if (item.success) {
      return;
    }

    const code = String(item?.error?.code || '').trim();
    if (INVALID_TOKEN_ERROR_CODES.has(code)) {
      invalidTokens.push(tokens[index]);
    }
  });

  await removeInvalidTokens(invalidTokens);

  return {
    totalTokens: tokens.length,
    sentCount: response.successCount,
    failedCount: response.failureCount,
    removedInvalidTokens: invalidTokens.length
  };
};

const saveToken = async ({ userId, token }) => {
  const normalizedUserId = String(userId || '').trim();
  const normalizedToken = String(token || '').trim();

  return UserNotificationToken.findOneAndUpdate(
    { token: normalizedToken },
    {
      $set: {
        userId: normalizedUserId
      },
      $setOnInsert: {
        createdAt: new Date()
      }
    },
    {
      upsert: true,
      new: true,
      runValidators: true
    }
  );
};

const sendNotificationToUser = async ({ userId, payload }) => {
  const normalizedUserId = String(userId || '').trim();
  const tokenDocs = await UserNotificationToken.find({ userId: normalizedUserId }).select('token').lean();

  return sendToTokens({
    tokenList: uniqueTokens(tokenDocs),
    payload
  });
};

const broadcastNotification = async ({ payload }) => {
  const tokenDocs = await UserNotificationToken.find({}).select('token').lean();

  return sendToTokens({
    tokenList: uniqueTokens(tokenDocs),
    payload
  });
};

module.exports = {
  saveToken,
  sendNotificationToUser,
  broadcastNotification
};
