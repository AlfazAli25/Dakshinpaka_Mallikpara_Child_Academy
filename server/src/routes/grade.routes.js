const express = require('express');
const { protect, requireRole } = require('../middleware/auth.middleware');
const controller = require('../controllers/grade.controller');

const router = express.Router();

router.get('/', protect, requireRole(['admin', 'teacher', 'student']), controller.list);
router.get('/:id', protect, requireRole(['admin', 'teacher', 'student']), controller.get);
router.post('/', protect, requireRole(['admin', 'teacher']), controller.create);
router.put('/:id', protect, requireRole(['admin', 'teacher']), controller.update);
router.delete('/:id', protect, requireRole(['admin']), controller.remove);

module.exports = router;