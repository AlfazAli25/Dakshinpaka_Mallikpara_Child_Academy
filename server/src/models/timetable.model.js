const mongoose = require('mongoose');

const TIMETABLE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MIN_PERIOD_NUMBER = 1;
const MAX_PERIOD_NUMBER = 6;

const toMinutes = (value) => {
  if (!TIME_24H_REGEX.test(String(value || ''))) {
    return Number.NaN;
  }

  const [hours, minutes] = String(value).split(':').map((item) => Number(item));
  return (hours * 60) + minutes;
};

const timetableSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    section: { type: String, required: true, trim: true },
    day: {
      type: String,
      required: true,
      enum: TIMETABLE_DAYS
    },
    periodNumber: {
      type: Number,
      required: true,
      min: MIN_PERIOD_NUMBER,
      max: MAX_PERIOD_NUMBER
    },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startTime: {
      type: String,
      required: true,
      trim: true,
      match: TIME_24H_REGEX
    },
    endTime: {
      type: String,
      required: true,
      trim: true,
      match: TIME_24H_REGEX,
      validate: {
        validator(value) {
          let startTime = this?.startTime;

          if (typeof this?.get === 'function') {
            startTime = this.get('startTime') || startTime;
          }

          if (!startTime && typeof this?.getUpdate === 'function') {
            const update = this.getUpdate() || {};
            startTime = update.startTime || update?.$set?.startTime || update?.$setOnInsert?.startTime || startTime;
          }

          // If startTime is not present in this validation context, defer to service-level validation.
          if (!startTime) {
            return true;
          }

          return toMinutes(value) > toMinutes(startTime);
        },
        message: 'End time must be after start time'
      }
    },
    roomNumber: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

timetableSchema.pre('validate', function preValidateTimetable(next) {
  this.section = String(this.section || '').trim();
  this.day = String(this.day || '').trim();
  this.startTime = String(this.startTime || '').trim();
  this.endTime = String(this.endTime || '').trim();
  this.roomNumber = String(this.roomNumber || '').trim();
  next();
});

timetableSchema.index(
  {
    classId: 1,
    section: 1,
    day: 1,
    periodNumber: 1
  },
  {
    unique: true
  }
);

timetableSchema.index(
  {
    teacherId: 1,
    day: 1,
    startTime: 1
  },
  {
    unique: true
  }
);

timetableSchema.index({ classId: 1, section: 1, day: 1, startTime: 1 });

const Timetable = mongoose.model('Timetable', timetableSchema);

Timetable.TIMETABLE_DAYS = TIMETABLE_DAYS;
Timetable.MIN_PERIOD_NUMBER = MIN_PERIOD_NUMBER;
Timetable.MAX_PERIOD_NUMBER = MAX_PERIOD_NUMBER;

module.exports = Timetable;