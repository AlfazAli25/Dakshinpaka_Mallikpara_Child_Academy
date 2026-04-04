const ClassModel = require('../models/class.model');
const createCrudService = require('./crud.service');
const Subject = require('../models/subject.model');
const Student = require('../models/student.model');
const Exam = require('../models/exam.model');
const Timetable = require('../models/timetable.model');
const Teacher = require('../models/teacher.model');

const base = createCrudService(ClassModel);

let ensureClassIndexPromise = null;

const isClassDuplicateError = (error) => {
	const code = Number(error?.code || 0);
	if (code !== 11000) {
		return false;
	}

	const keyPattern = error?.keyPattern || {};
	return Boolean(
		keyPattern.normalizedName ||
		keyPattern.normalizedSection ||
		keyPattern.name
	);
};

const buildClassDuplicateError = () => {
	const conflict = new Error('Class with the same name and section already exists');
	conflict.statusCode = 409;
	return conflict;
};

const ensureClassIndexes = async () => {
	if (ensureClassIndexPromise) {
		return ensureClassIndexPromise;
	}

	ensureClassIndexPromise = (async () => {
		const needsNormalizationRows = await ClassModel.find({
			$or: [{ normalizedName: { $exists: false } }, { normalizedSection: { $exists: false } }]
		}).select('_id name section');

		if (needsNormalizationRows.length > 0) {
			await Promise.all(
				needsNormalizationRows.map((item) => {
					const nextName = String(item.name || '').trim();
					const nextSection = String(item.section || '').trim();
					return ClassModel.updateOne(
						{ _id: item._id },
						{
							$set: {
								name: nextName,
								section: nextSection,
								normalizedName: nextName.toLowerCase(),
								normalizedSection: nextSection.toLowerCase()
							}
						}
					);
				})
			);
		}

		// Shift has been deprecated for classes; clear any legacy values.
		await ClassModel.collection.updateMany(
			{ shift: { $exists: true } },
			{ $unset: { shift: '' } }
		);

		const indexes = await ClassModel.collection.indexes();
		const legacyNameUniqueIndex = indexes.find(
			(item) => item?.unique && item?.key && Object.keys(item.key).length === 1 && item.key.name === 1
		);

		if (legacyNameUniqueIndex?.name) {
			await ClassModel.collection.dropIndex(legacyNameUniqueIndex.name);
		}

		const hasCompositeIndex = indexes.some(
			(item) => item?.unique && item?.key?.normalizedName === 1 && item?.key?.normalizedSection === 1
		);

		if (!hasCompositeIndex) {
			await ClassModel.collection.createIndex(
				{ normalizedName: 1, normalizedSection: 1 },
				{
					unique: true,
					name: 'normalizedName_1_normalizedSection_1',
					partialFilterExpression: {
						normalizedName: { $exists: true, $type: 'string', $ne: '' },
						normalizedSection: { $exists: true, $type: 'string' }
					}
				}
			);
		}
	})();

	try {
		await ensureClassIndexPromise;
	} catch (error) {
		ensureClassIndexPromise = null;
		throw error;
	}
};

const findAll = async (filter = {}) => {
	await ensureClassIndexes();
	return base.findAll(filter, 'classTeacher subjectIds');
};

const findById = async (id) => {
	await ensureClassIndexes();
	return base.findById(id, 'classTeacher subjectIds');
};

const create = async (payload = {}) => {
	await ensureClassIndexes();

	const normalizedName = String(payload.name || '').trim();
	const normalizedSection = String(payload.section || '').trim();
	if (!normalizedName) {
		const error = new Error('Class name is required');
		error.statusCode = 400;
		throw error;
	}

	try {
		return await ClassModel.create({
			name: normalizedName,
			section: normalizedSection || undefined,
			classTeacher: payload.classTeacher || undefined
		});
	} catch (error) {
		if (isClassDuplicateError(error)) {
			throw buildClassDuplicateError();
		}
		throw error;
	}
};

const updateById = async (id, payload = {}) => {
	await ensureClassIndexes();

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

	try {
		await ClassModel.findByIdAndUpdate(
			id,
			{
				name: nextName,
				section: payload.section !== undefined ? String(payload.section || '').trim() : classRecord.section,
				classTeacher: payload.classTeacher !== undefined ? payload.classTeacher : classRecord.classTeacher
			},
			{ new: true, runValidators: true }
		);
	} catch (error) {
		if (isClassDuplicateError(error)) {
			throw buildClassDuplicateError();
		}
		throw error;
	}

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