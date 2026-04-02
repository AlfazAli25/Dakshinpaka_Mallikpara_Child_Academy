const asyncHandler = require('../middleware/async.middleware');
const User = require('../models/user.model');

const getById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-passwordHash');
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  return res.json({ success: true, data: user });
});

const updateById = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  delete payload.passwordHash;
  const user = await User.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true }).select(
    '-passwordHash'
  );
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  return res.json({ success: true, data: user });
});

module.exports = { getById, updateById };