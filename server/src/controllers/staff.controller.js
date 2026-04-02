const createCrudController = require('./crud.controller.factory');
const staffService = require('../services/staff.service');

module.exports = createCrudController(staffService, 'Staff');