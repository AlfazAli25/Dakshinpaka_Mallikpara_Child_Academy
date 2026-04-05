const timetableService = require('../services/timetable.service');
const Student = require('../models/student.model');
const Teacher = require('../models/teacher.model');
const ClassModel = require('../models/class.model');

const normalizeId = (value) => String(value?._id || value || '');

const createTimetable = async (req, res, next) => {
  try {
    const data = await timetableService.createEntry({
      payload: req.body || {},
      createdBy: req.user?._id || null
    });

    return res.status(201).json({
      success: true,
      message: 'Timetable saved successfully',
      data
    });
  } catch (error) {
    return next(error);
  }
};

const getTimetableByClass = async (req, res, next) => {
  try {
    const classId = String(req.params.classId || '').trim();
    const role = req.user?.role;

    if (!classId) {
      return res.status(400).json({ success: false, message: 'Class is required' });
    }

    let requestedSection = req.query?.section;

    if (role === 'student') {
      const student = await Student.findOne({ userId: req.user._id }).select('classId').lean();
      if (!student?.classId || normalizeId(student.classId) !== classId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      if (!requestedSection) {
        const classRecord = await ClassModel.findById(student.classId).select('section').lean();
        requestedSection = String(classRecord?.section || '').trim() || undefined;
      }
    }

    if (role === 'teacher') {
      const teacher = await Teacher.findOne({ userId: req.user._id }).select('classIds').lean();
      const assignedClassSet = new Set((teacher?.classIds || []).map((item) => normalizeId(item)).filter(Boolean));
      const isClassAssigned = assignedClassSet.has(classId);

      if (!isClassAssigned) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }

    const result = await timetableService.listByClass({
      classId,
      section: requestedSection,
      day: req.query?.day,
      periodNumber: req.query?.periodNumber,
      query: req.query || {}
    });

    if (role === 'teacher') {
      const teacherUserId = normalizeId(req.user?._id);
      const filtered = (result.data || []).filter((row) => normalizeId(row.teacherId) === teacherUserId);

      return res.json({
        success: true,
        data: filtered,
        ...(result.pagination ? { pagination: result.pagination } : {})
      });
    }

    return res.json({
      success: true,
      data: result.data || [],
      ...(result.pagination ? { pagination: result.pagination } : {})
    });
  } catch (error) {
    return next(error);
  }
};

const getTimetableByTeacher = async (req, res, next) => {
  try {
    const requestedTeacherId = String(req.params.teacherId || '').trim();
    if (!requestedTeacherId) {
      return res.status(400).json({ success: false, message: 'Teacher is required' });
    }

    if (req.user?.role === 'student') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (req.user?.role === 'teacher') {
      const ownTeacherUserId = normalizeId(req.user?._id);
      const requestedAsUserId = await timetableService.resolveTeacherUserId(requestedTeacherId);
      if (ownTeacherUserId !== requestedAsUserId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }

    const result = await timetableService.listByTeacher({
      teacherId: requestedTeacherId,
      classId: req.query?.classId,
      section: req.query?.section,
      day: req.query?.day,
      startTime: req.query?.startTime,
      query: req.query || {}
    });

    return res.json({
      success: true,
      data: result.data || [],
      ...(result.pagination ? { pagination: result.pagination } : {})
    });
  } catch (error) {
    return next(error);
  }
};

const getMyTimetable = async (req, res, next) => {
  try {
    if (req.user?.role !== 'teacher') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const result = await timetableService.listByTeacher({
      teacherId: req.user._id,
      classId: req.query?.classId,
      section: req.query?.section,
      day: req.query?.day,
      startTime: req.query?.startTime,
      query: req.query || {}
    });

    return res.json({
      success: true,
      data: result.data || [],
      ...(result.pagination ? { pagination: result.pagination } : {})
    });
  } catch (error) {
    return next(error);
  }
};

const updateTimetable = async (req, res, next) => {
  try {
    const data = await timetableService.updateEntry({
      id: req.params.id,
      payload: req.body || {}
    });

    if (!data) {
      return res.status(404).json({ success: false, message: 'Timetable not found' });
    }

    return res.json({
      success: true,
      message: 'Timetable saved successfully',
      data
    });
  } catch (error) {
    return next(error);
  }
};

const deleteTimetable = async (req, res, next) => {
  try {
    const data = await timetableService.deleteEntry(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Timetable not found' });
    }

    return res.json({
      success: true,
      message: 'Timetable deleted successfully'
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createTimetable,
  getTimetableByClass,
  getTimetableByTeacher,
  updateTimetable,
  deleteTimetable,
  getMyTimetable
};