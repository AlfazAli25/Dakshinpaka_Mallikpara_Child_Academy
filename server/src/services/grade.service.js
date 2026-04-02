const Grade = require('../models/grade.model');
const createCrudService = require('./crud.service');

const base = createCrudService(Grade);

const findAll = (filter = {}) => base.findAll(filter, 'examId studentId');
const findById = (id) => base.findById(id, 'examId studentId');

module.exports = { ...base, findAll, findById };