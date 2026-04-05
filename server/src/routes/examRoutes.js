const express = require('express');
const { body, param } = require('express-validator');
const { authenticate } = require('../middleware/authMiddleware');
const { authorizeRole } = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate.middleware');
const controller = require('../controllers/examController');

const router = express.Router();

const EXAM_TYPES = ['Unit Test', 'Mid Term', 'Final', 'Practical', 'Assignment'];
const EXAM_STATUS = ['Scheduled', 'Ongoing', 'Completed'];
const ACADEMIC_YEAR_REGEX = /^\d{4}-\d{4}$/;

const validateDateRange = body().custom((value, { req }) => {
  const startInput = req.body.startDate;
  const endInput = req.body.endDate;

  if (startInput === undefined || startInput === null || String(startInput).trim() === '') {
    return true;
  }

  const startDate = new Date(startInput);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error('Valid start date is required');
  }

  if (endInput !== undefined && endInput !== null && String(endInput).trim() !== '') {
    const endDate = new Date(endInput);
    if (Number.isNaN(endDate.getTime())) {
      throw new Error('Invalid end date selected');
    }

    if (endDate.getTime() < startDate.getTime()) {
      throw new Error('End date must be greater than or equal to start date');
    }
  }

  return true;
});

const ensureUpdatePayload = body().custom((value, { req }) => {
  const editableFields = [
    'examName',
    'examType',
    'classId',
    'subjects',
    'academicYear',
    'startDate',
    'endDate',
    'description',
    'status'
  ];

  const hasAtLeastOne = editableFields.some((field) => req.body[field] !== undefined);
  if (!hasAtLeastOne) {
    throw new Error('Provide at least one exam field to update');
  }

  return true;
});

router.post(
  '/',
  authenticate,
  authorizeRole('admin'),
  [
    body('examName').notEmpty().withMessage('Exam name is required'),
    body('examType').optional().isIn(EXAM_TYPES).withMessage('Invalid exam type selected'),
    body('classId').isMongoId().withMessage('Valid class is required'),
    body('subjects').isArray({ min: 1 }).withMessage('Select at least one subject'),
    body('subjects.*').isMongoId().withMessage('Invalid subject selected'),
    body('academicYear')
      .matches(ACADEMIC_YEAR_REGEX)
      .withMessage('Academic year must be in YYYY-YYYY format'),
    body('startDate').notEmpty().withMessage('Start date is required'),
    validateDateRange,
    body('status').optional().isIn(EXAM_STATUS).withMessage('Invalid exam status selected')
  ],
  validate,
  controller.createExam
);

router.get(
  '/',
  authenticate,
  authorizeRole(['admin', 'teacher', 'student']),
  controller.getAllExams
);

router.get(
  '/class/:classId',
  authenticate,
  authorizeRole(['admin', 'teacher', 'student']),
  [param('classId').isMongoId().withMessage('Invalid class selected')],
  validate,
  controller.getExamsByClass
);

router.get(
  '/:id',
  authenticate,
  authorizeRole(['admin', 'teacher', 'student']),
  [param('id').isMongoId().withMessage('Invalid exam selected')],
  validate,
  controller.getExamById
);

router.put(
  '/:id',
  authenticate,
  authorizeRole('admin'),
  [
    param('id').isMongoId().withMessage('Invalid exam selected'),
    body('examName').optional().notEmpty().withMessage('Exam name is required'),
    body('examType').optional().isIn(EXAM_TYPES).withMessage('Invalid exam type selected'),
    body('classId').optional().isMongoId().withMessage('Valid class is required'),
    body('subjects').optional().isArray({ min: 1 }).withMessage('Select at least one subject'),
    body('subjects.*').optional().isMongoId().withMessage('Invalid subject selected'),
    body('academicYear')
      .optional()
      .matches(ACADEMIC_YEAR_REGEX)
      .withMessage('Academic year must be in YYYY-YYYY format'),
    validateDateRange,
    body('status').optional().isIn(EXAM_STATUS).withMessage('Invalid exam status selected'),
    ensureUpdatePayload
  ],
  validate,
  controller.updateExam
);

router.delete(
  '/:id',
  authenticate,
  authorizeRole('admin'),
  [param('id').isMongoId().withMessage('Invalid exam selected')],
  validate,
  controller.deleteExam
);

module.exports = router;
