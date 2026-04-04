const mongoose = require('mongoose');

const classSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    classTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' },
    subjectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
    section: { type: String, trim: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true, select: false },
    normalizedSection: { type: String, required: true, trim: true, lowercase: true, select: false }
  },
  { timestamps: true }
);

classSchema.pre('validate', function preValidateClass(next) {
  this.name = String(this.name || '').trim();
  this.section = String(this.section || '').trim();
  this.normalizedName = this.name.toLowerCase();
  this.normalizedSection = this.section.toLowerCase();
  next();
});

classSchema.index(
  { normalizedName: 1, normalizedSection: 1 },
  {
    unique: true,
    partialFilterExpression: {
      normalizedName: { $exists: true, $type: 'string', $ne: '' },
      normalizedSection: { $exists: true, $type: 'string' }
    }
  }
);

module.exports = mongoose.model('Class', classSchema);