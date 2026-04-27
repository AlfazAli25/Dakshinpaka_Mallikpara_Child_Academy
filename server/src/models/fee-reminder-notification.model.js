const mongoose = require('mongoose');

const feeReminderNotificationSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      unique: true,
      index: true
    },
    lastSentAt: {
      type: Date,
      required: true,
      index: true
    },
    lastPendingAmount: {
      type: Number,
      min: 0,
      default: 0
    },
    lastOverdueMonthKey: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('FeeReminderNotification', feeReminderNotificationSchema);
