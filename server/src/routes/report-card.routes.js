const express = require('express');
const { param, query } = require('express-validator');
const { protect, requireRole } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const controller = require('../controllers/report-card.controller');

const router = express.Router();

const ACADEMIC_YEAR_REGEX = /^\d{4}(?:-\d{4})?$/;

router.get(
  '/exam/:examId/student/me/status',
  protect,
  requireRole(['student']),
  [param('examId').isMongoId().withMessage('Invalid exam selected')],
  validate,
  controller.getMyReportCardStatusByExam
);

router.get(
  '/exam/:examId/student/me/download',
  protect,
  requireRole(['student']),
  [param('examId').isMongoId().withMessage('Invalid exam selected')],
  validate,
  controller.downloadMyReportCardByExam
);

router.get(
  '/class/:classId/zip',
  protect,
  requireRole(['admin']),
  [
    param('classId').isMongoId().withMessage('Invalid class selected'),
    query('academicYear')
      .optional({ checkFalsy: true })
      .matches(ACADEMIC_YEAR_REGEX)
      .withMessage('Academic year must be in YYYY or YYYY-YYYY format'),
    query('section').optional().isString().withMessage('Invalid section selected')
  ],
  validate,
  controller.downloadClassReportCardsZip
);

module.exports = router;
