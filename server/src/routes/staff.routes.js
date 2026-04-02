const express = require('express');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/staff.controller');

const router = express.Router();

router.get('/', protect, requireRole(['admin']), controller.list);
router.get('/:id', protect, requireRole(['admin']), controller.get);
router.post('/', protect, requireRole(['admin']), controller.create);
router.put('/:id', protect, requireRole(['admin']), controller.update);
router.delete('/:id', protect, requireRole(['admin']), controller.remove);

module.exports = router;