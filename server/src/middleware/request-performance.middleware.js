const { logInfo, logWarn } = require('../utils/logger');

const SLOW_ENDPOINT_THRESHOLD_MS = Number(process.env.SLOW_ENDPOINT_THRESHOLD_MS || 500);
const LOG_EVERY_REQUEST = String(process.env.LOG_EVERY_REQUEST || '').toLowerCase() === 'true';

const shouldSkipLogging = (req) => {
  const path = String(req.originalUrl || req.url || '').toLowerCase();
  return path.startsWith('/api/health');
};

const requestPerformanceLogger = (req, res, next) => {
  if (shouldSkipLogging(req)) {
    next();
    return;
  }

  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startTime) / 1e6;
    const payload = {
      requestId: req.requestId,
      method: req.method,
      endpoint: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(elapsedMs.toFixed(2))
    };

    if (elapsedMs >= SLOW_ENDPOINT_THRESHOLD_MS) {
      logWarn('Slow API detected', payload);
      return;
    }

    if (LOG_EVERY_REQUEST) {
      logInfo('api_request', payload);
    }
  });

  next();
};

module.exports = {
  requestPerformanceLogger
};
