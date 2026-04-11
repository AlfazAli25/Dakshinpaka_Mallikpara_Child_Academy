const asyncHandler = require('../middleware/async.middleware');
const { runMonthlySync, isMonthlyBoundaryInConfiguredTimezone } = require('../services/monthly-sync.service');
const { enqueueMonthlySyncJob } = require('../services/system-jobs.service');

const parseBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

const runMonthlySyncFromCron = asyncHandler(async (req, res) => {
  const force = parseBoolean(req.query?.force);
  const runAsync = parseBoolean(req.query?.async);

  if (!force && !isMonthlyBoundaryInConfiguredTimezone(new Date())) {
    return res.json({
      success: true,
      message: 'Skipped: not monthly boundary window for configured timezone',
      data: {
        skipped: true,
        reason: 'vercel-cron-non-boundary-window'
      }
    });
  }

  if (runAsync) {
    const queueResult = await enqueueMonthlySyncJob({
      reason: 'vercel-cron-monthly-boundary',
      force
    });

    return res.status(202).json({
      success: true,
      message: 'Monthly sync queued',
      data: queueResult
    });
  }

  const result = await runMonthlySync({
    reason: 'vercel-cron-monthly-boundary',
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
  const runAsync = parseBoolean(req.body?.async);

  if (runAsync) {
    const queueResult = await enqueueMonthlySyncJob({
      reason: 'admin-manual-trigger',
      force
    });

    return res.status(202).json({
      success: true,
      message: 'Monthly sync queued',
      data: queueResult
    });
  }

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