const mongoose = require('mongoose');
const { calculateGrade } = require('../utils/gradeCalculator');

const marksSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    marksObtained: { type: Number, required: true, min: 0 },
    maxMarks: { type: Number, required: true, min: 1 },
    percentage: { type: Number, min: 0 },
    grade: { type: String, trim: true },
    remarks: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

marksSchema.pre('validate', function preValidateMarks(next) {
  const obtained = Number(this.marksObtained);
  const total = Number(this.maxMarks);

  if (Number.isFinite(obtained) && Number.isFinite(total) && total > 0) {
    if (obtained > total) {
      const error = new Error('marksObtained cannot be greater than maxMarks');
      error.statusCode = 400;
      return next(error);
    }

    const { percentage, grade } = calculateGrade(obtained, total);
    this.percentage = percentage;
    this.grade = grade;
  }

  return next();
});

marksSchema.index({ studentId: 1, subjectId: 1, examId: 1 }, { unique: true });
marksSchema.index({ classId: 1, subjectId: 1, examId: 1 });
marksSchema.index({ studentId: 1, examId: 1 });

module.exports = mongoose.model('Marks', marksSchema);
