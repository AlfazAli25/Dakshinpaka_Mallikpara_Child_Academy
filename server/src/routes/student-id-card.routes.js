const express = require('express');
const { param } = require('express-validator');
const { protect, requireRole } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const controller = require('../controllers/student-id-card.controller');

const router = express.Router();

router.get(
  '/student/me/download',
  protect,
  requireRole(['student']),
  controller.downloadMyStudentIdCard
);

router.get(
  '/student/me/preview',
  protect,
  requireRole(['student']),
  controller.previewMyStudentIdCard
);

router.get(
  '/student/:studentId/download',
  protect,
  requireRole(['admin']),
  [param('studentId').isMongoId().withMessage('Invalid student selected')],
  validate,
  controller.downloadStudentIdCard
);

router.get(
  '/class/:classId/download-zip',
  protect,
  requireRole(['admin']),
  [param('classId').isMongoId().withMessage('Invalid class selected')],
  validate,
  controller.downloadClassIdCardsZip
);

module.exports = router;
