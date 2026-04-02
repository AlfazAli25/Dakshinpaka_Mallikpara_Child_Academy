const Attendance = require('../models/attendance.model');
const createCrudService = require('./crud.service');

const base = createCrudService(Attendance);

const findAll = (filter = {}) => base.findAll(filter, 'studentId classId markedBy');
const findById = (id) => base.findById(id, 'studentId classId markedBy');

module.exports = { ...base, findAll, findById };