const express = require('express');
const { body, param } = require('express-validator');
const { protect, requireRole } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const controller = require('../controllers/admit-card.controller');

const router = express.Router();

router.get(
  '/my/available',
  protect,
  requireRole(['student']),
  controller.listMyAvailableAdmitCards
);

router.get(
  '/exam/:examId',
  protect,
  requireRole(['admin']),
  [param('examId').isMongoId().withMessage('Invalid exam selected')],
  validate,
  controller.listExamAdmitCards
);

router.post(
  '/exam/:examId/sync',
  protect,
  requireRole(['admin']),
  [param('examId').isMongoId().withMessage('Invalid exam selected')],
  validate,
  controller.syncExamAdmitCards
);

router.patch(
  '/:admitCardId/fee-status',
  protect,
  requireRole(['admin']),
  [
    param('admitCardId').isMongoId().withMessage('Invalid admit card selected'),
    body('isFeePaid').isBoolean().withMessage('isFeePaid must be true or false')
  ],
  validate,
  controller.setAdmitCardFeeStatus
);

router.get(
  '/exam/:examId/class/:classId/download-zip',
  protect,
  requireRole(['admin']),
  [
    param('examId').isMongoId().withMessage('Invalid exam selected'),
    param('classId').isMongoId().withMessage('Invalid class selected')
  ],
  validate,
  controller.downloadClassAdmitCardsZip
);

router.get(
  '/:admitCardId/download',
  protect,
  requireRole(['admin', 'student']),
  [param('admitCardId').isMongoId().withMessage('Invalid admit card selected')],
  validate,
  controller.downloadAdmitCard
);

module.exports = router;
