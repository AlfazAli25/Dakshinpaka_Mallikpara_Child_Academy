const asyncHandler = require('../middleware/async.middleware');
const authService = require('../services/auth.service');

const register = asyncHandler(async (req, res) => {
  const user = await authService.register(req.body);
  res.status(201).json({ success: true, data: user });
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  res.json({ success: true, data: result });
});

const requestForgotPasswordOtp = asyncHandler(async (req, res) => {
  const result = await authService.requestForgotPasswordOtp(req.body);
  res.json({ success: true, data: result });
});

const verifyOtpAndResetPassword = asyncHandler(async (req, res) => {
  const result = await authService.verifyOtpAndResetPassword(req.body);
  res.json({ success: true, data: result });
});

module.exports = { register, login, requestForgotPasswordOtp, verifyOtpAndResetPassword };