const mongoose = require('mongoose');

const buildAcademicYear = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const month = safeDate.getMonth() + 1;
  const startYear = month >= 4 ? safeDate.getFullYear() : safeDate.getFullYear() - 1;
  const endYear = startYear + 1;
  return `${startYear}-${endYear}`;
};

const examSchema = new mongoose.Schema(
  {
    examName: { type: String, required: true, trim: true, default: 'Exam' },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    academicYear: {
      type: String,
      required: true,
      trim: true,
      default: () => buildAcademicYear(new Date())
    },
    examDate: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    date: { type: Date, required: true },
    totalMarks: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true }
  },
  { timestamps: true }
);

examSchema.pre('validate', function preValidateExam(next) {
  const normalizedExamName = String(this.examName || this.description || '').trim();
  this.examName = normalizedExamName || 'Exam';

  if (!this.examDate && this.date) {
    this.examDate = this.date;
  }

  if (!this.date && this.examDate) {
    this.date = this.examDate;
  }

  this.academicYear = String(this.academicYear || '').trim() || buildAcademicYear(this.examDate || this.date || new Date());
  next();
});

examSchema.index({ classId: 1, date: 1 });
examSchema.index({ classId: 1, subjectId: 1, date: 1 });
examSchema.index({ classId: 1, academicYear: 1, examDate: -1 });

module.exports = mongoose.model('Exam', examSchema);