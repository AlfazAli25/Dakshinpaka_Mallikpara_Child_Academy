const mongoose = require('mongoose');

const EXAM_TYPES = ['Unit Test', 'Final Exam'];
const EXAM_STATUS = ['Scheduled', 'Ongoing', 'Completed'];
const ACADEMIC_YEAR_REGEX = /^\d{4}$/;

const normalizeExamType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'unit test') {
    return 'Unit Test';
  }

  if (normalized === 'final exam' || normalized === 'final') {
    return 'Final Exam';
  }

  return '';
};

const buildAcademicYear = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return String(safeDate.getFullYear());
};

const normalizeObjectIdArray = (items = []) => {
  if (!Array.isArray(items)) {
    return [];
  }

  return Array.from(
    new Set(
      items
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
};

const normalizeDateValue = (value) => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const normalizeScheduleEntries = (items = [], defaultClassId = '') => {
  if (!Array.isArray(items)) {
    return [];
  }

  const uniqueRows = new Map();

  items.forEach((item) => {
    const classId = String(item?.classId || defaultClassId || '').trim();
    const subjectId = String(item?.subjectId || '').trim();
    const startDate = normalizeDateValue(item?.startDate);
    const endDate = normalizeDateValue(item?.endDate);

    if (!classId || !subjectId || !startDate || !endDate) {
      return;
    }

    if (endDate.getTime() < startDate.getTime()) {
      return;
    }

    const key = `${classId}:${subjectId}`;
    uniqueRows.set(key, {
      classId,
      subjectId,
      startDate,
      endDate
    });
  });

  return Array.from(uniqueRows.values());
};

const examSchema = new mongoose.Schema(
  {
    examName: { type: String, required: true, trim: true },
    examType: {
      type: String,
      enum: EXAM_TYPES,
      default: 'Unit Test'
    },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
    schedule: [
      {
        classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
        subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true }
      }
    ],
    academicYear: {
      type: String,
      required: true,
      trim: true
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    description: { type: String, trim: true },
    admitCardFeeAmount: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: EXAM_STATUS,
      default: 'Scheduled'
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Legacy compatibility fields used by some existing screens.
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    date: { type: Date },
    examDate: { type: Date },
    totalMarks: { type: Number, min: 0 }
  },
  { timestamps: true }
);

examSchema.pre('validate', function preValidateExam(next) {
  this.examName = String(this.examName || '').trim();

  const normalizedAcademicYear = String(this.academicYear || '').trim();
  this.academicYear = normalizedAcademicYear || buildAcademicYear(this.startDate || this.date || this.examDate || new Date());

  if (!ACADEMIC_YEAR_REGEX.test(this.academicYear)) {
    this.invalidate('academicYear', 'Academic year must be in YYYY format');
  }

  if (!this.startDate && this.date) {
    this.startDate = this.date;
  }

  if (!this.startDate && this.examDate) {
    this.startDate = this.examDate;
  }

  if (!this.date && this.startDate) {
    this.date = this.startDate;
  }

  if (!this.examDate && this.startDate) {
    this.examDate = this.startDate;
  }

  const normalizedSchedule = normalizeScheduleEntries(this.schedule || [], this.classId);
  this.schedule = normalizedSchedule;

  if (normalizedSchedule.length > 0) {
    const rootClassId = String(this.classId || '').trim();
    const mismatch = rootClassId
      ? normalizedSchedule.find((item) => String(item.classId || '') !== rootClassId)
      : null;

    if (mismatch) {
      this.invalidate('schedule', 'All schedule entries must belong to the selected class');
    }

    const scheduleSubjectIds = normalizeObjectIdArray(normalizedSchedule.map((item) => item.subjectId));
    const minScheduleStartMs = Math.min(...normalizedSchedule.map((item) => new Date(item.startDate).getTime()));
    const maxScheduleEndMs = Math.max(...normalizedSchedule.map((item) => new Date(item.endDate).getTime()));

    if (!this.startDate) {
      this.startDate = new Date(minScheduleStartMs);
    }

    if (!this.endDate) {
      this.endDate = new Date(maxScheduleEndMs);
    }

    this.subjects = normalizeObjectIdArray([...(this.subjects || []), ...scheduleSubjectIds]);
  }

  const normalizedSubjects = normalizeObjectIdArray(this.subjects || []);
  this.subjects = normalizedSubjects;

  if (normalizedSubjects.length === 0 && this.subjectId) {
    this.subjects = [String(this.subjectId)];
  }

  if (!this.subjectId && this.subjects.length > 0) {
    this.subjectId = this.subjects[0];
  }

  if (this.endDate && this.startDate) {
    const endDate = new Date(this.endDate);
    const startDate = new Date(this.startDate);

    if (!Number.isNaN(endDate.getTime()) && !Number.isNaN(startDate.getTime()) && endDate.getTime() < startDate.getTime()) {
      this.invalidate('endDate', 'End date must be greater than or equal to start date');
    }
  }

  const normalizedExamType = normalizeExamType(this.examType);
  this.examType = normalizedExamType || 'Unit Test';

  const admitCardFeeAmount = Number(this.admitCardFeeAmount ?? 0);
  if (!Number.isFinite(admitCardFeeAmount) || admitCardFeeAmount < 0) {
    this.invalidate('admitCardFeeAmount', 'Admit card fee amount must be 0 or more');
  } else {
    this.admitCardFeeAmount = Number(admitCardFeeAmount.toFixed(2));
  }

  if (!EXAM_STATUS.includes(String(this.status || '').trim())) {
    this.status = 'Scheduled';
  }

  next();
});

examSchema.index({ examName: 1, classId: 1, academicYear: 1 }, { unique: true });
examSchema.index({ classId: 1, startDate: 1 });
examSchema.index({ classId: 1, status: 1, startDate: 1 });
examSchema.index({ subjects: 1, startDate: 1 });
examSchema.index({ classId: 1, 'schedule.subjectId': 1, 'schedule.startDate': 1 });

module.exports = mongoose.model('Exam', examSchema);
