const asyncHandler = require('../middleware/async.middleware');
const timetableService = require('../services/timetable.service');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');

const normalizeId = (value) => String(value?._id || value || '');

const getMine = asyncHandler(async (req, res) => {
  if (req.user?.role !== 'teacher') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const teacher = await Teacher.findOne({ userId: req.user._id }).select('_id classIds subjects').lean();
  if (!teacher) {
    return res.json({ success: true, data: [] });
  }

  const classIds = Array.isArray(teacher.classIds) ? teacher.classIds : [];
  const subjectIdSet = new Set((teacher.subjects || []).map((item) => normalizeId(item)).filter(Boolean));
  const timetables = await timetableService.listByTeacherId({
    teacherId: teacher._id,
    classIds
  });

  const rows = timetables.flatMap((item) =>
    (item.schedule || [])
      .filter((entry) => {
        const isTeacherMatch = normalizeId(entry.teacherId) === normalizeId(teacher._id);
        if (!isTeacherMatch) {
          return false;
        }

        const subjectId = normalizeId(entry.subjectId);
        return subjectIdSet.size === 0 || subjectIdSet.has(subjectId);
      })
      .map((entry, index) => {
        const classLabel = item.classId?.section
          ? `${item.classId?.name} (${item.classId?.section})`
          : item.classId?.name || 'Class';

        return {
          id: `${normalizeId(item._id)}-${entry.day}-${entry.time}-${index}`,
          className: classLabel,
          day: entry.day,
          time: entry.time,
          subject: entry.subjectId?.name || '-'
        };
      })
  );

  return res.json({ success: true, data: rows });
});

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

module.exports = { getByClassId, getMine, createOrUpdate, update, remove };