const ClassModel = require('../models/class.model');
const createCrudService = require('./crud.service');
const Subject = require('../models/subject.model');
const Student = require('../models/student.model');
const Exam = require('../models/exam.model');
const Timetable = require('../models/timetable.model');
const Teacher = require('../models/teacher.model');

const base = createCrudService(ClassModel);

let ensureClassIndexPromise = null;

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isIgnorableIndexManagementError = (error) => {
	const code = Number(error?.code || 0);
	const codeName = String(error?.codeName || '').toLowerCase();
	const message = String(error?.message || '').toLowerCase();

	if ([13, 26, 27, 68, 85, 86].includes(code)) {
		return true;
	}

	if (['unauthorized', 'indexnotfound', 'indexkeyspecconflict', 'indexoptionsconflict'].includes(codeName)) {
		return true;
	}

	return (
		message.includes('not authorized') ||
		message.includes('index not found') ||
		(message.includes('index') && message.includes('already exists'))
	);
};

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

const ensureClassNameSectionUnique = async ({ name, section, excludeId = null }) => {
	const normalizedName = String(name || '').trim();
	const normalizedSection = String(section || '').trim();
	const query = {
		$or: [
			{
				normalizedName: normalizedName.toLowerCase(),
				normalizedSection: normalizedSection.toLowerCase()
			},
			{
				name: { $regex: `^${escapeRegex(normalizedName)}$`, $options: 'i' },
				section: { $regex: `^${escapeRegex(normalizedSection)}$`, $options: 'i' }
			}
		]
	};

	if (excludeId) {
		query._id = { $ne: excludeId };
	}

	const existing = await ClassModel.findOne(query).select('_id');
	if (existing) {
		throw buildClassDuplicateError();
	}
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
		try {
			await ClassModel.collection.updateMany(
				{ shift: { $exists: true } },
				{ $unset: { shift: '' } }
			);
		} catch (error) {
			if (!isIgnorableIndexManagementError(error)) {
				throw error;
			}
		}

		let indexes = [];
		try {
			indexes = await ClassModel.collection.indexes();
		} catch (error) {
			if (!isIgnorableIndexManagementError(error)) {
				throw error;
			}
			return;
		}
		const legacyNameUniqueIndex = indexes.find(
			(item) => item?.unique && item?.key && Object.keys(item.key).length === 1 && item.key.name === 1
		);

		if (legacyNameUniqueIndex?.name) {
			try {
				await ClassModel.collection.dropIndex(legacyNameUniqueIndex.name);
			} catch (error) {
				if (!isIgnorableIndexManagementError(error)) {
					throw error;
				}
			}
		}

		const hasCompositeIndex = indexes.some(
			(item) => item?.unique && item?.key?.normalizedName === 1 && item?.key?.normalizedSection === 1
		);

		if (!hasCompositeIndex) {
			try {
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
			} catch (error) {
				const duplicateDataDuringIndexBuild = Number(error?.code || 0) === 11000;
				if (duplicateDataDuringIndexBuild) {
					return;
				}

				if (!isIgnorableIndexManagementError(error)) {
					throw error;
				}
			}
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
	return base.findAll(filter, 'classTeacher subjectIds');
};

const findById = async (id) => {
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

	await ensureClassNameSectionUnique({ name: normalizedName, section: normalizedSection });

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
	const nextSection =
		payload.section !== undefined ? String(payload.section || '').trim() : String(classRecord.section || '').trim();
	if (!nextName) {
		const error = new Error('Class name is required');
		error.statusCode = 400;
		throw error;
	}

	await ensureClassNameSectionUnique({
		name: nextName,
		section: nextSection,
		excludeId: classRecord._id
	});

	try {
		await ClassModel.findByIdAndUpdate(
			id,
			{
				name: nextName,
				section: nextSection,
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