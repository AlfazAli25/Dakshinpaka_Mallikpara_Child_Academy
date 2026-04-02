const asyncHandler = require('../middleware/async.middleware');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');
const receiptService = require('../services/receipt.service');

const listStudentReceipts = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user._id });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student record not found' });
  }

  const receipts = await receiptService.findStudentReceipts(student._id);
  res.json({ success: true, data: receipts });
});

const listTeacherReceipts = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findOne({ userId: req.user._id });
  if (!teacher) {
    return res.status(404).json({ success: false, message: 'Teacher record not found' });
  }

  const receipts = await receiptService.findTeacherReceipts(teacher._id);
  res.json({ success: true, data: receipts });
});

module.exports = { listStudentReceipts, listTeacherReceipts };
