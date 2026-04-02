const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const validate = require('../middleware/validate.middleware');
const { allowOnlyInitialAdminRegistration } = require('../middleware/register.middleware');

const router = express.Router();

router.post(
  '/register',
  allowOnlyInitialAdminRegistration,
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Please enter a valid email address.'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').optional().equals('admin').withMessage('Only admin registration is allowed from this endpoint')
  ],
  validate,
  authController.register
);

router.post(
  '/login',
  [body('identifier').notEmpty().withMessage('Student ID, Teacher ID, or Email is required'), body('password').notEmpty().withMessage('Password is required')],
  validate,
  authController.login
);

router.post(
  '/forgot-password/request-otp',
  [body('identifier').notEmpty().withMessage('Student ID, Teacher ID, or Email is required')],
  validate,
  authController.requestForgotPasswordOtp
);

router.post(
  '/forgot-password/verify-otp',
  [
    body('identifier').notEmpty().withMessage('Student ID, Teacher ID, or Email is required'),
    body('otp').matches(/^\d{6}$/).withMessage('OTP must be a 6-digit number'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  validate,
  authController.verifyOtpAndResetPassword
);

module.exports = router;