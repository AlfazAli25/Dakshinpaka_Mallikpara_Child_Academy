const express = require('express');
const { body, param } = require('express-validator');
const { authenticate } = require('../middleware/authMiddleware');
const { authorizeRole } = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate.middleware');
const controller = require('../controllers/marksController');

const router = express.Router();

const requireMarksNotGreaterThanMax = body('marksObtained').custom((value, { req }) => {
  const marksObtained = Number(value);
  const maxMarks = Number(req.body.maxMarks);

  if (!Number.isFinite(marksObtained) || !Number.isFinite(maxMarks)) {
    return true;
  }

  if (marksObtained > maxMarks) {
    throw new Error('marksObtained cannot be greater than maxMarks');
  }

  return true;
});

const ensureAtLeastOneUpdatableField = body().custom((value, { req }) => {
  const editableFields = ['studentId', 'classId', 'subjectId', 'examId', 'marksObtained', 'maxMarks', 'remarks'];
  const hasOne = editableFields.some((field) => req.body[field] !== undefined);
  if (!hasOne) {
    throw new Error('Provide at least one field to update');
  }
  return true;
});

router.get('/', authenticate, authorizeRole('admin'), controller.listMarks);

router.get(
  '/student/:studentId',
  authenticate,
  authorizeRole(['admin', 'teacher', 'student']),
  [param('studentId').isMongoId().withMessage('Invalid student selected')],
  validate,
  controller.getMarksByStudent
);

router.get(
  '/class/:classId',
  authenticate,
  authorizeRole(['admin', 'teacher']),
  [param('classId').isMongoId().withMessage('Invalid class selected')],
  validate,
  controller.getMarksByClass
);

router.post(
  '/',
  authenticate,
  authorizeRole('teacher'),
  [
    body('studentId').isMongoId().withMessage('Invalid student selected'),
    body('classId').isMongoId().withMessage('Invalid class selected'),
    body('subjectId').isMongoId().withMessage('Invalid subject selected'),
    body('examId').isMongoId().withMessage('Invalid exam selected'),
    body('marksObtained').isFloat({ min: 0 }).withMessage('marksObtained must be a valid non-negative number'),
    body('maxMarks').isFloat({ gt: 0 }).withMessage('maxMarks must be greater than zero'),
    requireMarksNotGreaterThanMax,
    body('remarks').optional().isString().withMessage('Remarks must be text')
  ],
  validate,
  controller.createMarks
);

router.put(
  '/:id',
  authenticate,
  authorizeRole('teacher'),
  [
    param('id').isMongoId().withMessage('Invalid marks record selected'),
    body('studentId').optional().isMongoId().withMessage('Invalid student selected'),
    body('classId').optional().isMongoId().withMessage('Invalid class selected'),
    body('subjectId').optional().isMongoId().withMessage('Invalid subject selected'),
    body('examId').optional().isMongoId().withMessage('Invalid exam selected'),
    body('marksObtained').optional().isFloat({ min: 0 }).withMessage('marksObtained must be a valid non-negative number'),
    body('maxMarks').optional().isFloat({ gt: 0 }).withMessage('maxMarks must be greater than zero'),
    body().custom((value, { req }) => {
      if (req.body.marksObtained !== undefined && req.body.maxMarks !== undefined) {
        const marksObtained = Number(req.body.marksObtained);
        const maxMarks = Number(req.body.maxMarks);
        if (Number.isFinite(marksObtained) && Number.isFinite(maxMarks) && marksObtained > maxMarks) {
          throw new Error('marksObtained cannot be greater than maxMarks');
        }
      }
      return true;
    }),
    body('remarks').optional().isString().withMessage('Remarks must be text'),
    ensureAtLeastOneUpdatableField
  ],
  validate,
  controller.updateMarks
);

router.delete(
  '/:id',
  authenticate,
  authorizeRole('admin'),
  [param('id').isMongoId().withMessage('Invalid marks record selected')],
  validate,
  controller.deleteMarks
);

module.exports = router;
