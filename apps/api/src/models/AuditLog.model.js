const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  performedByName: { type: String, default: '' },
  targetId: { type: mongoose.Schema.Types.ObjectId },
  targetType: { type: String, default: '' },
  ipAddress: { type: String, default: null },  // H3: capture requester IP
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
