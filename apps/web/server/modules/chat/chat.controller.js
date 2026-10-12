const chatService = require('./chat.service');
const { emitToRoom, closeChatRoom } = require('../../config/socket');

exports.getMyRooms = async (req, res) => {
  try {
    const rooms = await chatService.getMyRooms(req.user.sub);
    res.json({ success: true, data: rooms });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getRoom = async (req, res) => {
  try {
    const room = await chatService.getRoomById(req.params.id, req.user.sub);
    res.json({ success: true, data: room });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.createRoom = async (req, res) => {
  try {
    const room = await chatService.createRoom(req.body, req.user);
    res.status(201).json({ success: true, message: 'Room created', data: room });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.addMember = async (req, res) => {
  try {
    const room = await chatService.addMember(req.params.id, req.body.userId, req.user);
    res.json({ success: true, message: 'Member added', data: room });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const messages = await chatService.getMessages(req.params.id, req.user.sub);
    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

const validateActionUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Single leading slash (not protocol-relative //)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  // Allowed base hosts from environment
  const allowedHosts = new Set(['localhost', '127.0.0.1']);
  const baseEnvs = [process.env.BASE_URL, process.env.APP_URL, process.env.FRONTEND_URL, process.env.CLIENT_URL];
  for (const b of baseEnvs) {
    if (b) {
      try {
        const parsed = new URL(b);
        allowedHosts.add(parsed.hostname.toLowerCase());
      } catch (_) {}
    }
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';
    if (parsed.protocol === 'https:' || (isLocalhost && parsed.protocol === 'http:')) {
      if (allowedHosts.has(host) || host.endsWith('.vercel.app')) {
        return trimmed;
      }
    }
  } catch (_) {
    return null;
  }

  return null;
};

exports.sendMessage = async (req, res) => {
  try {
    const { text, qrCode, actionUrl } = req.body;
    const safeActionUrl = validateActionUrl(actionUrl);
    const message = await chatService.sendMessage(req.params.id, text, req.user, { qrCode, actionUrl: safeActionUrl });

    // Real-time emit to room
    await emitToRoom(`chat:${req.params.id}`, 'chat:new_message', {
      _id: message._id,
      roomId: message.roomId,
      roomName: message.roomName,
      senderId: message.senderId,
      senderName: message.senderName,
      text: message.text,
      qrCode: message.qrCode,
      actionUrl: message.actionUrl,
      createdAt: message.createdAt,
    });

    res.status(201).json({ success: true, data: message });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.archiveRoom = async (req, res) => {
  try {
    const room = await chatService.archiveRoom(req.params.id, req.user);
    res.json({ success: true, message: 'Room archived', data: room });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.createOrGetTeamRoom = async (req, res) => {
  try {
    const room = await chatService.createOrGetTeamRoom(req.params.teamId, req.user);
    res.status(201).json({ success: true, message: 'Team chat ready', data: room });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteRoom = async (req, res) => {
  try {
    const result = await chatService.deleteRoom(req.params.id, req.user);
    closeChatRoom(req.params.id);
    res.json({ success: true, message: 'Room deleted', data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const message = await chatService.deleteMessage(req.params.id, req.user);
    await emitToRoom(`chat:${message.roomId}`, 'chat:message_deleted', {
      messageId: req.params.id,
      roomId: message.roomId,
    });
    res.json({ success: true, message: 'Message deleted' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
