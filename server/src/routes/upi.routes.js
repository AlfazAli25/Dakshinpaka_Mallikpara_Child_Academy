const express = require('express');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/upi.controller');
const validate = require('../middleware/validate.middleware');

const router = express.Router();

// POST /api/upi/generate-link
router.post('/generate-link',
  protect,
  requireRole(['student']),
  validate,
  controller.generateUpiLink
);

module.exports = router;
