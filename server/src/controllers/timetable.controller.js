const asyncHandler = require('../middleware/async.middleware');
const timetableService = require('../services/timetable.service');

const getByClassId = asyncHandler(async (req, res) => {
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