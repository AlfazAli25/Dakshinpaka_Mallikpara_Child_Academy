const mongoose = require('mongoose');

const classSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    classTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' },
    subjectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
    section: { type: String, trim: true },
    shift: { type: String, trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Class', classSchema);