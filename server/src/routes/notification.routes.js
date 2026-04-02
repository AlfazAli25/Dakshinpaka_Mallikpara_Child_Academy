const express = require('express');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/notification.controller');

const router = express.Router();

router.get('/admin', protect, requireRole(['admin']), controller.listAdmin);
router.post('/:id/read', protect, requireRole(['admin']), controller.markRead);

module.exports = router;
