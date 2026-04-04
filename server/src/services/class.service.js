const ClassModel = require('../models/class.model');
const createCrudService = require('./crud.service');
const Subject = require('../models/subject.model');
const Student = require('../models/student.model');
const Exam = require('../models/exam.model');
const Timetable = require('../models/timetable.model');
const Teacher = require('../models/teacher.model');

const base = createCrudService(ClassModel);

const findAll = (filter = {}) => base.findAll(filter, 'classTeacher subjectIds');
const findById = (id) => base.findById(id, 'classTeacher subjectIds');

const create = async (payload = {}) => {
	const normalizedName = String(payload.name || '').trim();
	if (!normalizedName) {
		const error = new Error('Class name is required');
		error.statusCode = 400;
		throw error;
	}

	return ClassModel.create({
		name: normalizedName,
		section: String(payload.section || '').trim() || undefined,
		shift: String(payload.shift || '').trim() || undefined,
		classTeacher: payload.classTeacher || undefined
	});
};

const updateById = async (id, payload = {}) => {
	const classRecord = await ClassModel.findById(id);
	if (!classRecord) {
		return null;
	}

	const nextName = payload.name !== undefined ? String(payload.name || '').trim() : String(classRecord.name || '').trim();
	if (!nextName) {
		const error = new Error('Class name is required');
		error.statusCode = 400;
		throw error;
	}

	await ClassModel.findByIdAndUpdate(
		id,
		{
			name: nextName,
			section: payload.section !== undefined ? String(payload.section || '').trim() : classRecord.section,
			shift: payload.shift !== undefined ? String(payload.shift || '').trim() : classRecord.shift,
			classTeacher: payload.classTeacher !== undefined ? payload.classTeacher : classRecord.classTeacher
		},
		{ new: true, runValidators: true }
	);

	return findById(id);
};

const deleteById = async (id) => {
	const classRecord = await ClassModel.findById(id);
	if (!classRecord) {
		return null;
	}

	const [linkedStudent, linkedExam, linkedTimetable] = await Promise.all([
		Student.findOne({ classId: classRecord._id }).select('_id'),
		Exam.findOne({ classId: classRecord._id }).select('_id'),
		Timetable.findOne({ classId: classRecord._id }).select('_id')
	]);

	if (linkedStudent || linkedExam || linkedTimetable) {
		const error = new Error('Cannot delete class with linked students, exams, or timetable records');
		error.statusCode = 400;
		throw error;
	}

	const classSubjects = await Subject.find({ classId: classRecord._id }).select('_id');
	const subjectIds = classSubjects.map((item) => item._id).filter(Boolean);

	await Promise.all([
		ClassModel.findByIdAndDelete(classRecord._id),
		Subject.deleteMany({ classId: classRecord._id }),
		Teacher.updateMany(
			{},
			{
				$pull: {
					classIds: classRecord._id,
					...(subjectIds.length > 0 ? { subjects: { $in: subjectIds } } : {})
				}
			}
		)
	]);

	return classRecord;
};

module.exports = { ...base, findAll, findById, create, updateById, deleteById };