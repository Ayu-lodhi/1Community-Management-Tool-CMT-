const mongoose = require('mongoose');

const monthLockSchema = new mongoose.Schema({
  month: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}$/ },
  isLocked: { type: Boolean, default: true },
  lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lockedAt: { type: Date, default: Date.now },
  unlockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  unlockedAt: { type: Date, default: null },
  unlockReason: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('MonthLock', monthLockSchema);
