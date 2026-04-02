const Exam = require('../models/exam.model');
const createCrudService = require('./crud.service');

const base = createCrudService(Exam);

const findAll = (filter = {}) => base.findAll(filter, 'classId subjectId');
const findById = (id) => base.findById(id, 'classId subjectId');

module.exports = { ...base, findAll, findById };