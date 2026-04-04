const mongoose = require('mongoose');

const buildMonthKeyFromDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}`;
};

const feeSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    monthKey: { type: String, required: true, trim: true },
    dueDate: { type: Date, required: true },
    amountDue: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['PENDING', 'PARTIALLY PAID', 'PAID'],
      default: 'PENDING',
      index: true
    },
    paymentDate: { type: Date },
    paymentMethod: { type: String, trim: true }
  },
  { timestamps: true }
);

feeSchema.pre('validate', function onValidate(next) {
  if (!this.monthKey && this.dueDate) {
    this.monthKey = buildMonthKeyFromDate(this.dueDate);
  }
  this.status = this.status || 'PENDING';
  next();
});

feeSchema.index({ studentId: 1, dueDate: 1 });
feeSchema.index({ studentId: 1, status: 1, dueDate: 1 });
feeSchema.index(
  { studentId: 1, monthKey: 1 },
  { unique: true, partialFilterExpression: { monthKey: { $exists: true, $type: 'string' } } }
);

module.exports = mongoose.model('Fee', feeSchema);