const express = require('express');
const { body, query } = require('express-validator');
const { protect, requireRole } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const controller = require('../controllers/system.controller');

const router = express.Router();

const requireCronSecret = (req, res, next) => {
  const configuredSecret = String(process.env.CRON_SECRET || '').trim();
  if (!configuredSecret) {
    if (String(process.env.NODE_ENV || '').toLowerCase() !== 'production') {
      return next();
    }

    return res.status(503).json({
      success: false,
      message: 'CRON_SECRET is not configured'
    });
  }

  const authorizationHeader = String(req.headers.authorization || '').trim();
  if (authorizationHeader === `Bearer ${configuredSecret}`) {
    return next();
  }

  return res.status(401).json({
    success: false,
    message: 'Unauthorized cron request'
  });
};

router.get(
  '/monthly-sync/run',
  requireCronSecret,
  [query('force').optional().isIn(['true', 'false', '1', '0', 'yes', 'no']).withMessage('force must be boolean-like')],
  validate,
  controller.runMonthlySyncFromCron
);

router.post(
  '/monthly-sync/run',
  protect,
  requireRole(['admin']),
  [body('force').optional().isBoolean().withMessage('force must be true or false')],
  validate,
  controller.runMonthlySyncFromAdmin
);

module.exports = router;