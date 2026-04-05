const { protect } = require('./auth.middleware');

const authenticate = protect;

module.exports = { authenticate, protect };
