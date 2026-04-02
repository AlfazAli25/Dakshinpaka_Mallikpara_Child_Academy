const Staff = require('../models/staff.model');
const createCrudService = require('./crud.service');

module.exports = createCrudService(Staff);