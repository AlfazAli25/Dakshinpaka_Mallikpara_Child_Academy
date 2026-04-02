const createCrudController = require('./crud.controller.factory');
const subjectService = require('../services/subject.service');

module.exports = createCrudController(subjectService, 'Subject');