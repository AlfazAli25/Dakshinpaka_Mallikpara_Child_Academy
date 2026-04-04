const Attendance = require('../models/attendance.model');
const createCrudService = require('./crud.service');

const base = createCrudService(Attendance);

const normalizeAttendanceDate = (value) => {
	const parsed = new Date(value || new Date());
	if (Number.isNaN(parsed.getTime())) {
		return new Date();
	}

	return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

const findAll = (filter = {}) => base.findAll(filter, 'studentId classId markedBy');
const findById = (id) => base.findById(id, 'studentId classId markedBy');

const create = async (payload = {}) => {
	const normalizedDate = normalizeAttendanceDate(payload.date);
	const filter = {
		studentId: payload.studentId,
		classId: payload.classId,
		date: normalizedDate
	};

	const updated = await Attendance.findOneAndUpdate(
		filter,
		{
			...payload,
			date: normalizedDate
		},
		{
			upsert: true,
			new: true,
			runValidators: true,
			setDefaultsOnInsert: true
		}
	).populate('studentId classId markedBy');

	return updated;
};

module.exports = { ...base, findAll, findById, create };