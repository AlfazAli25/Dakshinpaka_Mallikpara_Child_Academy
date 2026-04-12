const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    passwordResetOtpHash: { type: String },
    passwordResetOtpExpiresAt: { type: Date },
    passwordResetOtpRequestedAt: { type: Date },
    role: {
      type: String,
      enum: ['admin', 'teacher', 'student', 'parent'],
      default: 'student'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);