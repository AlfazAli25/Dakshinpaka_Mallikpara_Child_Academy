const Subject = require('../models/subject.model');
const createCrudService = require('./crud.service');

module.exports = createCrudService(Subject);