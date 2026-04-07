const asyncHandler = require('../middleware/async.middleware');
const { runMonthlySync } = require('../services/monthly-sync.service');

const parseBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

const runMonthlySyncFromCron = asyncHandler(async (req, res) => {
  const force = parseBoolean(req.query?.force);
  const result = await runMonthlySync({
    reason: 'vercel-cron',
    force
  });

  res.json({
    success: true,
    message: result.skipped ? 'Monthly sync already completed for this month' : 'Monthly sync completed',
    data: result
  });
});

const runMonthlySyncFromAdmin = asyncHandler(async (req, res) => {
  const force = parseBoolean(req.body?.force);
  const result = await runMonthlySync({
    reason: 'admin-manual-trigger',
    force
  });

  res.json({
    success: true,
    message: result.skipped ? 'Monthly sync already completed for this month' : 'Monthly sync completed',
    data: result
  });
});

module.exports = {
  runMonthlySyncFromCron,
  runMonthlySyncFromAdmin
};