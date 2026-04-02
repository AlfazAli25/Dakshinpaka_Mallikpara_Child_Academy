const mongoose = require('mongoose');

const actionLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true, trim: true },
    module: { type: String, required: true, trim: true },
    entityId: { type: String, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

actionLogSchema.index({ module: 1, createdAt: -1 });
actionLogSchema.index({ actorId: 1, createdAt: -1 });

module.exports = mongoose.model('ActionLog', actionLogSchema);
