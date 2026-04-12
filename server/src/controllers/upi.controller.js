const asyncHandler = require('../middleware/async.middleware');
const upiService = require('../services/upi.service');

exports.generateUpiLink = asyncHandler(async (req, res) => {
  const { feeType } = req.body;
  const userId = req.user._id;

  // Optionally, allow feeType or noticeId to be passed for different payment types
  const result = await upiService.generateUpiLinkForStudent({ userId, feeType });

  res.status(201).json({
    success: true,
    data: result
  });
});
