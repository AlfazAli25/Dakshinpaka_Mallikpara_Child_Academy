const Subject = require('../models/subject.model');
const ClassModel = require('../models/class.model');
const Teacher = require('../models/teacher.model');
const Exam = require('../models/exam.model');
const Timetable = require('../models/timetable.model');

let legacyLinksSynced = false;

const ensureLegacySubjectClassLinks = async () => {
	if (legacyLinksSynced) {
		return;
	}

	const classRows = await ClassModel.find({ subjectIds: { $exists: true, $ne: [] } }).select('_id subjectIds');
	for (const classRow of classRows) {
		const subjectIds = Array.isArray(classRow.subjectIds) ? classRow.subjectIds.filter(Boolean) : [];
		if (subjectIds.length === 0) {
			continue;
		}

		await Subject.updateMany(
			{
				_id: { $in: subjectIds },
				$or: [{ classId: { $exists: false } }, { classId: null }]
			},
			{ $set: { classId: classRow._id } }
		);
	}

	legacyLinksSynced = true;
};

const buildDuplicateError = (error) => {
	if (!error || error.code !== 11000) {
		return null;
	}

	const conflictField = Object.keys(error.keyPattern || {})[0] || '';
	const friendly = new Error(
		conflictField === 'normalizedCode'
			? 'Subject code already exists in this class'
			: 'Subject already exists in this class'
	);
	friendly.statusCode = 409;
	return friendly;
};

const normalizeSubjectPayload = (payload = {}) => ({
	name: String(payload.name || '').trim(),
	code: String(payload.code || '').trim().toUpperCase(),
	classId: payload.classId
});

const ensureClassExists = async (classId) => {
	const classRecord = await ClassModel.findById(classId).select('_id');
	if (!classRecord) {
		const error = new Error('Class not found for this subject');
		error.statusCode = 404;
		throw error;
	}
};

const findAll = async (filter = {}) => {
	await ensureLegacySubjectClassLinks();
	return Subject.find(filter).populate('classId');
};

const findById = async (id) => {
	await ensureLegacySubjectClassLinks();
	return Subject.findById(id).populate('classId');
};

const create = async (payload = {}) => {
	const normalized = normalizeSubjectPayload(payload);

	if (!normalized.name || !normalized.classId) {
		const error = new Error('Subject name and class are required');
		error.statusCode = 400;
		throw error;
	}

	await ensureClassExists(normalized.classId);

	try {
		const subject = await Subject.create(normalized);
		await ClassModel.findByIdAndUpdate(normalized.classId, { $addToSet: { subjectIds: subject._id } });
		return findById(subject._id);
	} catch (error) {
		throw buildDuplicateError(error) || error;
	}
};

const updateById = async (id, payload = {}) => {
	const subject = await Subject.findById(id);
	if (!subject) {
		return null;
	}

	if (payload.classId && String(payload.classId) !== String(subject.classId || '')) {
		const error = new Error('Subject class cannot be changed after creation');
		error.statusCode = 400;
		throw error;
	}

	const nextName = payload.name !== undefined ? String(payload.name || '').trim() : String(subject.name || '').trim();
	const nextCode = payload.code !== undefined ? String(payload.code || '').trim().toUpperCase() : String(subject.code || '').trim();

	if (!nextName) {
		const error = new Error('Subject name is required');
		error.statusCode = 400;
		throw error;
	}

	try {
		await Subject.findByIdAndUpdate(
			subject._id,
			{
				name: nextName,
				code: nextCode
			},
			{ new: true, runValidators: true }
		);

		return findById(subject._id);
	} catch (error) {
		throw buildDuplicateError(error) || error;
	}
};

const deleteById = async (id) => {
	const subject = await Subject.findById(id);
	if (!subject) {
		return null;
	}

	const [linkedExam, linkedTimetable] = await Promise.all([
		Exam.findOne({ subjectId: subject._id }).select('_id'),
		Timetable.findOne({ 'schedule.subjectId': subject._id }).select('_id')
	]);

	if (linkedExam || linkedTimetable) {
		const error = new Error('Cannot delete subject linked to exam or timetable records');
		error.statusCode = 400;
		throw error;
	}

	await Promise.all([
		Subject.findByIdAndDelete(subject._id),
		ClassModel.findByIdAndUpdate(subject.classId, { $pull: { subjectIds: subject._id } }),
		Teacher.updateMany({}, { $pull: { subjects: subject._id } })
	]);

	return subject;
};

module.exports = { findAll, findById, create, updateById, deleteById };