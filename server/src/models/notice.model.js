const mongoose = require('mongoose');

const NOTICE_TYPES = ['General', 'Payment'];
const NOTICE_STATUS = ['Active', 'Expired'];
const RECIPIENT_ROLES = ['student', 'teacher'];

const noticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    recipientRole: {
      type: String,
      enum: RECIPIENT_ROLES,
      default: 'student'
    },
    classIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
    noticeType: {
      type: String,
      enum: NOTICE_TYPES,
      default: 'General'
    },
    amount: { type: Number, min: 0 },
    dueDate: { type: Date },
    isImportant: { type: Boolean, default: false },
    status: {
      type: String,
      enum: NOTICE_STATUS,
      default: 'Active'
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

noticeSchema.pre('validate', function preValidateNotice(next) {
  this.title = String(this.title || '').trim();
  this.description = String(this.description || '').trim();
  this.recipientRole = String(this.recipientRole || 'student').trim().toLowerCase();
  this.noticeType = String(this.noticeType || 'General').trim();
  this.status = String(this.status || 'Active').trim();

  if (!Array.isArray(this.classIds)) {
    this.classIds = [];
  }

  if (this.noticeType === 'Payment') {
    if (this.recipientRole === 'teacher') {
      this.invalidate('noticeType', 'Payment notices can only be issued to students');
    }

    if (!Number.isFinite(Number(this.amount)) || Number(this.amount) <= 0) {
      this.invalidate('amount', 'Amount is required for payment notices');
    }
  } else {
    this.amount = undefined;
  }

  next();
});

noticeSchema.index({ classIds: 1, status: 1, createdAt: -1 });
noticeSchema.index({ classIds: 1 });
noticeSchema.index({ recipientRole: 1, status: 1, isImportant: -1, createdAt: -1 });
noticeSchema.index({ recipientRole: 1, noticeType: 1, status: 1, dueDate: 1 });

const Notice = mongoose.model('Notice', noticeSchema);

Notice.NOTICE_TYPES = NOTICE_TYPES;
Notice.NOTICE_STATUS = NOTICE_STATUS;
Notice.RECIPIENT_ROLES = RECIPIENT_ROLES;

module.exports = Notice;
