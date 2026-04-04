const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');
const { sendEmail } = require('../utils/mailer');
const { isValidEmail } = require('../utils/validation');
const { SCHOOL_NAME } = require('../config/school');

const normalizeIdentifier = (identifier = '') => identifier.trim();

const buildInvalidCredentialsError = () => {
  const error = new Error('Invalid credentials');
  error.statusCode = 401;
  return error;
};

const findUserByIdentifier = async (identifier) => {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  if (!normalizedIdentifier) {
    return null;
  }

  let user = await User.findOne({ email: normalizedIdentifier.toLowerCase() });
  if (user) {
    return user;
  }

  const student = await Student.findOne({ admissionNo: normalizedIdentifier });
  if (student) {
    user = await User.findById(student.userId);
    if (user) {
      return user;
    }
  }

  const teacher = await Teacher.findOne({ teacherId: normalizedIdentifier });
  if (teacher) {
    user = await User.findById(teacher.userId);
  }

  return user;
};

const register = async ({ name, email, password, role = 'admin' }) => {
  const normalizedRole = role || 'admin';
  const normalizedEmail = String(email || '').toLowerCase().trim();

  if (!isValidEmail(normalizedEmail)) {
    const error = new Error('Please enter a valid email address.');
    error.statusCode = 400;
    throw error;
  }

  if (normalizedRole !== 'admin') {
    const error = new Error('Students and teachers must be created from admin modules');
    error.statusCode = 403;
    throw error;
  }

  const adminCount = await User.countDocuments({ role: 'admin' });
  if (adminCount > 0) {
    const error = new Error('Admin is already registered. Additional admin registration is disabled');
    error.statusCode = 403;
    throw error;
  }

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    const error = new Error('Email already in use');
    error.statusCode = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email: normalizedEmail, passwordHash, role: normalizedRole });

  return { id: user._id, name: user.name, email: user.email, role: user.role };
};

const login = async ({ identifier, password }) => {
  const user = await findUserByIdentifier(identifier);

  if (!user) {
    throw buildInvalidCredentialsError();
  }

  const matched = await bcrypt.compare(password, user.passwordHash);
  if (!matched) {
    throw buildInvalidCredentialsError();
  }

  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d'
  });

  return {
    token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role }
  };
};

const requestForgotPasswordOtp = async ({ identifier }) => {
  const user = await findUserByIdentifier(identifier);
  if (!user) {
    return { message: 'If the account exists, an OTP has been sent to the admin email' };
  }

  const adminForEmail = await User.findOne({ role: 'admin' });
  const adminEmail = process.env.ADMIN_EMAIL || adminForEmail?.email;
  if (!adminEmail) {
    const error = new Error('Admin email is not configured');
    error.statusCode = 500;
    throw error;
  }

  const otp = `${crypto.randomInt(100000, 999999)}`;
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

  user.passwordResetOtpHash = otpHash;
  user.passwordResetOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  user.passwordResetOtpRequestedAt = new Date();
  await user.save();

  const subject = `Password Reset OTP - ${SCHOOL_NAME}`;
  const text = `OTP for resetting password\n\nUser: ${user.name} (${user.email})\nIdentifier used: ${normalizeIdentifier(identifier)}\nOTP: ${otp}\nValid for: 10 minutes`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin: 0 0 10px;">Password Reset Verification</h2>
      <p style="margin: 0 0 12px;">Use this OTP to approve a password reset request.</p>
      <p style="margin: 0 0 8px;"><strong>User:</strong> ${user.name} (${user.email})</p>
      <p style="margin: 0 0 16px;"><strong>Identifier used:</strong> ${normalizeIdentifier(identifier)}</p>
      <div style="display: inline-block; padding: 10px 14px; background: #e2e8f0; border-radius: 8px; font-size: 24px; letter-spacing: 2px; font-weight: bold;">${otp}</div>
      <p style="margin: 16px 0 0; color: #475569;">This OTP expires in 10 minutes.</p>
    </div>
  `;

  await sendEmail({ to: adminEmail, subject, text, html });

  return { message: 'If the account exists, an OTP has been sent to the admin email' };
};

const verifyOtpAndResetPassword = async ({ identifier, otp, newPassword }) => {
  const user = await findUserByIdentifier(identifier);
  if (!user || !user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
    const error = new Error('Invalid or expired OTP');
    error.statusCode = 400;
    throw error;
  }

  if (user.passwordResetOtpExpiresAt.getTime() < Date.now()) {
    const error = new Error('OTP has expired');
    error.statusCode = 400;
    throw error;
  }

  const otpHash = crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
  if (otpHash !== user.passwordResetOtpHash) {
    const error = new Error('Invalid or expired OTP');
    error.statusCode = 400;
    throw error;
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.passwordResetOtpHash = undefined;
  user.passwordResetOtpExpiresAt = undefined;
  user.passwordResetOtpRequestedAt = undefined;
  await user.save();

  return { message: 'Password reset successful. Please login with your new password' };
};

const getRegistrationStatus = async () => {
  const adminCount = await User.countDocuments({ role: 'admin' });
  const allowAdminRegistration = adminCount === 0;

  return {
    adminExists: !allowAdminRegistration,
    allowAdminRegistration
  };
};

module.exports = {
  register,
  login,
  requestForgotPasswordOtp,
  verifyOtpAndResetPassword,
  findUserByIdentifier,
  getRegistrationStatus
};