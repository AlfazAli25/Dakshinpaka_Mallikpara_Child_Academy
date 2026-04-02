const Timetable = require('../models/timetable.model');

const getByClassId = async (classId) => Timetable.findOne({ classId }).populate('schedule.subjectId schedule.teacherId');

const createOrUpdate = async ({ classId, schedule }) =>
  Timetable.findOneAndUpdate({ classId }, { schedule }, { upsert: true, new: true, runValidators: true });

const updateById = async (id, payload) => Timetable.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
const deleteById = async (id) => Timetable.findByIdAndDelete(id);

module.exports = { getByClassId, createOrUpdate, updateById, deleteById };