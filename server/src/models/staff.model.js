const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    department: { type: String, trim: true },
    contact: { type: String, trim: true },
    joiningDate: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Staff', staffSchema);