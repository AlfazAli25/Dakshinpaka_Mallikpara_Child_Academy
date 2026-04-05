const mongoose = require('mongoose');

const EXAM_TYPES = ['Unit Test', 'Mid Term', 'Final', 'Practical', 'Assignment'];
const EXAM_STATUS = ['Scheduled', 'Ongoing', 'Completed'];
const ACADEMIC_YEAR_REGEX = /^\d{4}-\d{4}$/;

const buildAcademicYear = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const month = safeDate.getMonth() + 1;
  const startYear = month >= 4 ? safeDate.getFullYear() : safeDate.getFullYear() - 1;
  const endYear = startYear + 1;
  return `${startYear}-${endYear}`;
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
    academicYear: {
      type: String,
      required: true,
      trim: true
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    description: { type: String, trim: true },
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
    this.invalidate('academicYear', 'Academic year must be in YYYY-YYYY format');
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

  if (!EXAM_TYPES.includes(String(this.examType || '').trim())) {
    this.examType = 'Unit Test';
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

module.exports = mongoose.model('Exam', examSchema);