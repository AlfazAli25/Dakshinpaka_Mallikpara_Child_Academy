const express = require('express');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/dashboard.controller');

const router = express.Router();

router.get('/summary', protect, requireRole(['admin']), controller.getDashboardSummary);

module.exports = router;
