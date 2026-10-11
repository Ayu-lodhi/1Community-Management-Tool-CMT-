const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
  roomName: { type: String, default: '' },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: { type: String, required: true },
  text: { type: String, required: true, maxlength: 5000 },
  qrCode: { type: String, default: null },
  actionUrl: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

messageSchema.index({ roomId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
