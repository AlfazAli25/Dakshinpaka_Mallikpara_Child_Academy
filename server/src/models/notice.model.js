const mongoose = require('mongoose');

const NOTICE_TYPES = ['General', 'Payment'];
const NOTICE_STATUS = ['Active', 'Expired'];
const RECIPIENT_ROLES = ['student', 'teacher', 'all'];
const NOTICE_SOURCE_TYPES = ['MANUAL', 'ADMIT_CARD_SYSTEM'];
const NOTICE_ACTION_TYPES = ['NONE', 'ADMIT_CARD_DOWNLOAD'];

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
    studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
    noticeType: {
      type: String,
      enum: NOTICE_TYPES,
      default: 'General'
    },
    amount: { type: Number, min: 0 },
    dueDate: { type: Date },
    isImportant: { type: Boolean, default: false },
    sourceType: {
      type: String,
      enum: NOTICE_SOURCE_TYPES,
      default: 'MANUAL'
    },
    actionType: {
      type: String,
      enum: NOTICE_ACTION_TYPES,
      default: 'NONE'
    },
    actionLabel: { type: String, trim: true },
    actionPath: { type: String, trim: true },
    admitCardId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdmitCard' },
    admitCardExamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
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

  if (!Array.isArray(this.studentIds)) {
    this.studentIds = [];
  }

  this.classIds = Array.from(new Set(this.classIds.map((item) => String(item || '').trim()).filter(Boolean)));
  this.studentIds = Array.from(new Set(this.studentIds.map((item) => String(item || '').trim()).filter(Boolean)));

  if (this.recipientRole === 'all') {
    this.classIds = [];
    this.studentIds = [];
  }

  this.sourceType = String(this.sourceType || 'MANUAL').trim();
  if (!NOTICE_SOURCE_TYPES.includes(this.sourceType)) {
    this.sourceType = 'MANUAL';
  }

  this.actionType = String(this.actionType || 'NONE').trim();
  if (!NOTICE_ACTION_TYPES.includes(this.actionType)) {
    this.actionType = 'NONE';
  }

  if (this.actionType === 'ADMIT_CARD_DOWNLOAD') {
    this.actionLabel = String(this.actionLabel || 'Download Admit Card').trim();
    this.actionPath = String(this.actionPath || '').trim();
    if (!this.actionPath) {
      this.invalidate('actionPath', 'Download action path is required');
    }
  } else {
    this.actionLabel = String(this.actionLabel || '').trim();
    this.actionPath = String(this.actionPath || '').trim();
  }

  if (this.noticeType === 'Payment') {
    if (this.recipientRole !== 'student') {
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
noticeSchema.index({ studentIds: 1, status: 1, createdAt: -1 });
noticeSchema.index({ recipientRole: 1, status: 1, isImportant: -1, createdAt: -1 });
noticeSchema.index({ recipientRole: 1, noticeType: 1, status: 1, dueDate: 1 });
noticeSchema.index({ sourceType: 1, admitCardExamId: 1, noticeType: 1, status: 1 });
noticeSchema.index({ admitCardId: 1 }, { unique: true, sparse: true });

const Notice = mongoose.model('Notice', noticeSchema);

Notice.NOTICE_TYPES = NOTICE_TYPES;
Notice.NOTICE_STATUS = NOTICE_STATUS;
Notice.RECIPIENT_ROLES = RECIPIENT_ROLES;
Notice.NOTICE_SOURCE_TYPES = NOTICE_SOURCE_TYPES;
Notice.NOTICE_ACTION_TYPES = NOTICE_ACTION_TYPES;

module.exports = Notice;
