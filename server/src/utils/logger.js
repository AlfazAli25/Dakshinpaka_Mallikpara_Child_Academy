const safeJsonStringify = (value) => {
  const seen = new WeakSet();

  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'object' && item !== null) {
      if (seen.has(item)) {
        return '[Circular]';
      }
      seen.add(item);
    }

    if (typeof item === 'string' && item.length > 1600) {
      return `${item.slice(0, 1600)}...<truncated>`;
    }

    return item;
  });
};

const writeLog = (level, message, meta = {}) => {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  };

  const line = safeJsonStringify(payload);

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
};

const logInfo = (message, meta) => writeLog('info', message, meta);
const logWarn = (message, meta) => writeLog('warn', message, meta);
const logError = (message, meta) => writeLog('error', message, meta);

module.exports = {
  logInfo,
  logWarn,
  logError
};
