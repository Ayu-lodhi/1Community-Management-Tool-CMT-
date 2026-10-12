// ====================================================================
// Socket.io Server — JWT-authenticated real-time gateway
// ====================================================================

const { Server } = require('socket.io');

let io = null;

const normalizeRoomId = (roomId) =>
  typeof roomId === 'string' && /^[a-f\d]{24}$/i.test(roomId) ? roomId.toLowerCase() : null;

const canAccessRoom = async (roomId, userId) => {
  try {
    // Load lazily: chat notifications also depend on this socket module.
    return await require('../modules/chat/chat.service').canAccessRoom(roomId, userId);
  } catch {
    return false; // A failed authorization lookup must never disclose messages.
  }
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (process.env.ALLOWED_ORIGINS) {
    const list = process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
    if (list.includes(origin)) return true;
  }
  if (/^https:\/\/.*\.vercel\.app$/.test(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
};

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        callback(null, isAllowedOrigin(origin));
      },
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  // JWT handshake
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const { authenticateToken } = require('../modules/auth/auth.middleware');
      const decoded = await authenticateToken(token);
      socket.userId = decoded.sub;
      socket.userRole = decoded.role;
      socket.userName = decoded.name || 'User';
      next();
    } catch (err) {
      return next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.userName} (${socket.userId})`);

    socket.join(`user:${socket.userId}`);

    const pendingJoins = new Map();
    socket.on('chat:join', async (roomId) => {
      const id = normalizeRoomId(roomId);
      if (!id) return;
      const request = Symbol();
      pendingJoins.set(id, request);
      const allowed = await canAccessRoom(id, socket.userId);
      if (pendingJoins.get(id) !== request) return;
      pendingJoins.delete(id);
      if (allowed && socket.connected) {
        await socket.join(`chat:${id}`);
      } else {
        await socket.leave(`chat:${id}`);
      }
    });

    socket.on('chat:leave', (roomId) => {
      const id = normalizeRoomId(roomId);
      if (id) {
        pendingJoins.delete(id);
        socket.leave(`chat:${id}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.userName}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

const emitToUser = (userId, event, data) => {
  if (!io || !userId) return;
  io.to(`user:${userId.toString()}`).emit(event, data);
};

const emitToRoom = async (roomId, event, data) => {
  if (!io || !roomId) return;
  const id = normalizeRoomId(typeof roomId === 'string' ? roomId.replace(/^chat:/, '') : null);
  if (!id) return;
  const room = `chat:${id}`;
  const sockets = await io.in(room).fetchSockets();
  await Promise.all(sockets.map(async (socket) => {
    // Recheck stored access so an existing subscription cannot outlive access.
    if (await canAccessRoom(id, socket.userId)) {
      if (socket.rooms.has(room)) socket.emit(event, data);
    } else {
      await socket.leave(room);
    }
  }));
};

const closeChatRoom = (roomId) => {
  const id = normalizeRoomId(roomId);
  if (!io || !id) return;
  const room = `chat:${id}`;
  // The room no longer exists. Send only its identifier, then evict subscribers.
  io.to(room).emit('chat:room_deleted', { roomId: id });
  io.in(room).socketsLeave(room);
};

const emitToAll = (event, data) => {
  if (!io) return;
  io.emit(event, data);
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToRoom,
  closeChatRoom,
  emitToAll,
};
