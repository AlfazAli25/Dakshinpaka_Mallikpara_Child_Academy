const { randomUUID } = require('crypto');

const resolveRequestId = (incomingId) => {
  const normalized = String(incomingId || '').trim();
  if (normalized) {
    return normalized.slice(0, 120);
  }

  return randomUUID();
};

const attachRequestContext = (req, res, next) => {
  const requestId = resolveRequestId(req.headers['x-request-id']);
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
};

module.exports = {
  attachRequestContext
};
