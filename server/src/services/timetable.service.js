const Timetable = require('../models/timetable.model');

const TIMETABLE_POPULATE = [
	{ path: 'classId', select: 'name section' },
	{ path: 'schedule.subjectId', select: 'name code classId' },
	{ path: 'schedule.teacherId', select: 'teacherId userId' }
];

const getByClassId = async (classId) =>
	Timetable.findOne({ classId })
		.populate(TIMETABLE_POPULATE)
		.lean();

const listByTeacherId = async ({ teacherId, classIds = [] } = {}) => {
	if (!teacherId) {
		return [];
	}

	const query = {
		'schedule.teacherId': teacherId
	};

	if (Array.isArray(classIds) && classIds.length > 0) {
		query.classId = { $in: classIds };
	}

	return Timetable.find(query)
		.populate(TIMETABLE_POPULATE)
		.lean();
};

const createOrUpdate = async ({ classId, schedule }) =>
  Timetable.findOneAndUpdate({ classId }, { schedule }, { upsert: true, new: true, runValidators: true });

const updateById = async (id, payload) => Timetable.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
const deleteById = async (id) => Timetable.findByIdAndDelete(id);

module.exports = { getByClassId, listByTeacherId, createOrUpdate, updateById, deleteById };