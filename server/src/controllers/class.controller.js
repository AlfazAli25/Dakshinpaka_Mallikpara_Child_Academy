const createCrudController = require('./crud.controller.factory');
const classService = require('../services/class.service');

module.exports = createCrudController(classService, 'Class');