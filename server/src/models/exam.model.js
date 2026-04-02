const mongoose = require('mongoose');

const examSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    date: { type: Date, required: true },
    totalMarks: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true }
  },
  { timestamps: true }
);

examSchema.index({ classId: 1, date: 1 });

module.exports = mongoose.model('Exam', examSchema);