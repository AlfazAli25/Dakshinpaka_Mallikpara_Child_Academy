const mongoose = require('mongoose');

// Stores one FCM device token and the owning user id.
const userNotificationTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    token: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    versionKey: false
  }
);

module.exports = mongoose.model('UserNotificationToken', userNotificationTokenSchema);
