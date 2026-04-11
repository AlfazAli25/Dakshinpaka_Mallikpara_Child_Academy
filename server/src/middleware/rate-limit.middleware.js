const rateLimit = require('express-rate-limit');

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 100);
const ENABLE_RATE_LIMIT = String(process.env.ENABLE_RATE_LIMIT || 'true').toLowerCase() !== 'false';

const limiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = String(req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown');
    return `${ip}:${req.method}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again shortly.'
    });
  }
});

const rateLimitMiddleware = (req, res, next) => {
  if (!ENABLE_RATE_LIMIT) {
    next();
    return;
  }

  limiter(req, res, next);
};

module.exports = {
  rateLimitMiddleware
};
