const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, default: '' },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true, select: false },
    normalizedCode: { type: String, trim: true, uppercase: true, default: '', select: false }
  },
  { timestamps: true }
);

subjectSchema.pre('validate', function preValidateSubject(next) {
  this.name = String(this.name || '').trim();
  this.code = String(this.code || '').trim();
  this.normalizedName = this.name.toLowerCase();
  this.normalizedCode = this.code.toUpperCase();
  next();
});

subjectSchema.index({ classId: 1, normalizedName: 1 }, { unique: true });
subjectSchema.index(
  { classId: 1, normalizedCode: 1 },
  {
    unique: true,
    partialFilterExpression: {
      normalizedCode: { $exists: true, $type: 'string', $ne: '' }
    }
  }
);

module.exports = mongoose.model('Subject', subjectSchema);