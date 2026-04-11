const winston = require('winston');

const truncateLongString = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  if (value.length <= 1600) {
    return value;
  }

  return `${value.slice(0, 1600)}...<truncated>`;
};

const sanitizeMeta = (value) => {
  const seen = new WeakSet();

  const visit = (item) => {
    if (Array.isArray(item)) {
      return item.map((entry) => visit(entry));
    }

    if (item && typeof item === 'object') {
      if (seen.has(item)) {
        return '[Circular]';
      }

      seen.add(item);
      const output = {};
      for (const [key, value] of Object.entries(item)) {
        output[key] = visit(value);
      }
      return output;
    }

    return truncateLongString(item);
  };

  return visit(value);
};

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: {
    service: 'sms-server'
  },
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error']
    })
  ]
});

const writeLog = (level, message, meta = {}) => {
  logger.log({
    level,
    message,
    ...sanitizeMeta(meta)
  });
};

const logInfo = (message, meta) => writeLog('info', message, meta);
const logWarn = (message, meta) => writeLog('warn', message, meta);
const logError = (message, meta) => writeLog('error', message, meta);

module.exports = {
  logger,
  logInfo,
  logWarn,
  logError
};
