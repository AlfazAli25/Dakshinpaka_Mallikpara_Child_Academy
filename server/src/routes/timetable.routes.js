const express = require('express');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/timetable.controller');

const router = express.Router();

router.get('/:classId', protect, controller.getByClassId);
router.post('/', protect, requireRole(['admin']), controller.createOrUpdate);
router.put('/:id', protect, requireRole(['admin']), controller.update);
router.delete('/:id', protect, requireRole(['admin']), controller.remove);

module.exports = router;