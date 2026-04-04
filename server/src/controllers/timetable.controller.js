const asyncHandler = require('../middleware/async.middleware');
const timetableService = require('../services/timetable.service');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');

const getByClassId = asyncHandler(async (req, res) => {
  if (req.user?.role === 'teacher') {
    const teacher = await Teacher.findOne({ userId: req.user._id }).select('_id classIds');
    if (!teacher) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const classSet = new Set((teacher.classIds || []).map((value) => String(value || '')));
    const classAllowedByAssignment = classSet.has(String(req.params.classId));

    if (!classAllowedByAssignment) {
      const legacyAssignment = await timetableService.getByClassId(req.params.classId);
      const hasLegacySchedule = Array.isArray(legacyAssignment?.schedule)
        && legacyAssignment.schedule.some((item) => String(item.teacherId?._id || item.teacherId || '') === String(teacher._id));

      if (!hasLegacySchedule) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }
  }

  if (req.user?.role === 'student') {
    const student = await Student.findOne({ userId: req.user._id }).select('classId');
    if (!student?.classId || String(student.classId) !== String(req.params.classId)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
  }

  const data = await timetableService.getByClassId(req.params.classId);
  if (!data) {
    return res.status(404).json({ success: false, message: 'Timetable not found' });
  }
  return res.json({ success: true, data });
});

const createOrUpdate = asyncHandler(async (req, res) => {
  const data = await timetableService.createOrUpdate(req.body);
  res.status(201).json({ success: true, data });
});

const update = asyncHandler(async (req, res) => {
  const data = await timetableService.updateById(req.params.id, req.body);
  if (!data) {
    return res.status(404).json({ success: false, message: 'Timetable not found' });
  }
  return res.json({ success: true, data });
});

const remove = asyncHandler(async (req, res) => {
  const data = await timetableService.deleteById(req.params.id);
  if (!data) {
    return res.status(404).json({ success: false, message: 'Timetable not found' });
  }
  return res.json({ success: true, message: 'Timetable deleted' });
});

module.exports = { getByClassId, createOrUpdate, update, remove };