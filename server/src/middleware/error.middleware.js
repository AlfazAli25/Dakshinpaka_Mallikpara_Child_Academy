const { logError } = require('../utils/logger');

const notFound = (req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
};

const errorHandler = (err, req, res, _next) => {
  const statusCode = err.statusCode || 500;

  logError('api_error', {
    requestId: req.requestId,
    method: req.method,
    endpoint: req.originalUrl,
    statusCode,
    message: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
};

module.exports = { notFound, errorHandler };