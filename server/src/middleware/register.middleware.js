const User = require('../models/user.model');

const allowOnlyInitialAdminRegistration = async (_req, res, next) => {
  try {
    const adminCount = await User.countDocuments({ role: 'admin' });

    if (adminCount === 0) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Admin is already registered. Additional admin registration is disabled'
    });
  } catch (_error) {
    return res.status(500).json({ success: false, message: 'Unable to verify registration permissions' });
  }
};

module.exports = { allowOnlyInitialAdminRegistration };
