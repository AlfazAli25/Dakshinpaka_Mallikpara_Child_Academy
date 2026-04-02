const ClassModel = require('../models/class.model');
const createCrudService = require('./crud.service');

const base = createCrudService(ClassModel);

const findAll = (filter = {}) => base.findAll(filter, 'classTeacher subjectIds');
const findById = (id) => base.findById(id, 'classTeacher subjectIds');

module.exports = { ...base, findAll, findById };