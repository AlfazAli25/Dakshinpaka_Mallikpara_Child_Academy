const ActionLog = require('../models/action-log.model');

const createActionLog = async ({ actorId, action, module, entityId, metadata }) => {
  try {
    await ActionLog.create({ actorId, action, module, entityId, metadata });
  } catch (_error) {
    // Logging failures must not block user operations.
  }
};

module.exports = { createActionLog };
