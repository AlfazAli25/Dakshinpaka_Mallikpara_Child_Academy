const mongoose = require('mongoose');

const ADMIT_CARD_STATUS = ['WAITING_ELIGIBILITY', 'AVAILABLE'];

const admitCardScheduleSchema = new mongoose.Schema(
  {
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    subjectName: { type: String, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true }
  },
  { _id: false }
);

const admitCardSchema = new mongoose.Schema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    feeNoticeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notice' },
    noticeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notice' },
    examName: { type: String, required: true, trim: true },
    academicYear: { type: String, trim: true },
    examStartDate: { type: Date },
    examEndDate: { type: Date },
    scheduleSnapshot: { type: [admitCardScheduleSchema], default: [] },
    admitCardFeeAmount: { type: Number, min: 0, default: 0 },
    isFeePaid: { type: Boolean, default: false },
    isStudentEligible: { type: Boolean, default: true },
    isDownloadEnabled: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ADMIT_CARD_STATUS,
      default: 'WAITING_ELIGIBILITY'
    },
    availableAt: { type: Date },
    noticePublishedAt: { type: Date },
    lastEligibilityCheckedAt: { type: Date },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

admitCardSchema.index({ examId: 1, studentId: 1 }, { unique: true });
admitCardSchema.index({ studentId: 1, status: 1, isActive: 1, updatedAt: -1 });
admitCardSchema.index({ examId: 1, status: 1, updatedAt: -1 });

const AdmitCard = mongoose.model('AdmitCard', admitCardSchema);
AdmitCard.ADMIT_CARD_STATUS = ADMIT_CARD_STATUS;

module.exports = AdmitCard;
