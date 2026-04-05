const Exam = require('../models/exam.model');
const Grade = require('../models/grade.model');
const Marks = require('../models/marks.model');
const createCrudService = require('./crud.service');

const base = createCrudService(Exam);

const findAll = (filter = {}) => base.findAll(filter, 'classId subjectId');
const findById = (id) => base.findById(id, 'classId subjectId');

const deleteById = async (id) => {
	const [linkedGrade, linkedMarks] = await Promise.all([
		Grade.findOne({ examId: id }).select('_id'),
		Marks.findOne({ examId: id }).select('_id')
	]);

	if (linkedGrade || linkedMarks) {
		const error = new Error('Cannot delete exam linked to grade or marks records');
		error.statusCode = 400;
		throw error;
	}

	return base.deleteById(id);
};

module.exports = { ...base, findAll, findById, deleteById };