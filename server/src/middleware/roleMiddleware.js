const { requireRole } = require('./auth.middleware');

const normalizeRoles = (inputRoles = []) => {
  if (!Array.isArray(inputRoles)) {
    return [];
  }

  return inputRoles
    .flatMap((item) => (Array.isArray(item) ? item : [item]))
    .map((item) => String(item || '').trim())
    .filter(Boolean);
};

const authorizeRole = (...roles) => {
  const normalizedRoles = normalizeRoles(roles);
  return requireRole(normalizedRoles);
};

module.exports = { authorizeRole };
