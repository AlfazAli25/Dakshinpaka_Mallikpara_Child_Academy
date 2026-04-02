const express = require('express');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/subject.controller');

const router = express.Router();

router.get('/', protect, controller.list);
router.get('/:id', protect, controller.get);
router.post('/', protect, requireRole(['admin']), controller.create);
router.put('/:id', protect, requireRole(['admin']), controller.update);
router.delete('/:id', protect, requireRole(['admin']), controller.remove);

module.exports = router;