const Sentry = require('@sentry/node');
const { logInfo, logWarn } = require('../utils/logger');

let sentryEnabled = false;

const initMonitoring = () => {
  const dsn = String(process.env.SENTRY_DSN || '').trim();
  if (!dsn) {
    logInfo('sentry_disabled', { reason: 'SENTRY_DSN not configured' });
    sentryEnabled = false;
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1)
  });

  sentryEnabled = true;
  logInfo('sentry_enabled', {
    environment: process.env.NODE_ENV || 'development'
  });
};

const captureException = (error, context = {}) => {
  if (!sentryEnabled) {
    return;
  }

  try {
    Sentry.withScope((scope) => {
      Object.entries(context || {}).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
      Sentry.captureException(error);
    });
  } catch (_error) {
    logWarn('sentry_capture_failed', {
      message: 'Failed to capture exception in Sentry'
    });
  }
};

const isSentryEnabled = () => sentryEnabled;

module.exports = {
  initMonitoring,
  captureException,
  isSentryEnabled
};
