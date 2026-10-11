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

// Reuse the mounted HTTP policy, including account state, credentials and MFA.
const authorizeSocket = async (socket) => {
  const target = io?.sockets?.sockets?.get?.(socket.id) || socket;
  try {
    if (!target.connected) return false;
    const { authenticateToken } = require('../modules/auth/auth.middleware');
    await authenticateToken(target.handshake?.auth?.token);
    // Authentication performs asynchronous reads; expiry may pass while waiting.
    if (target.connected && Date.now() < target.accessExpiresAt) return true;
  } catch {
    // Account lookup failures must also stop protected delivery.
  }
  target.disconnect(true);
  if (target !== socket && typeof socket.disconnect === 'function') {
    socket.disconnect(true);
  }
  return false;
};


// Per-user rate limiting for Socket.io events (Sliding window: max 30 events per 10 seconds)
const SOCKET_EVENT_LIMIT = 30;
const SOCKET_WINDOW_SECONDS = 10;
const inMemorySocketBuckets = new Map();

const checkSocketRateLimit = async (userId) => {
  if (!userId) return false;
  const key = `ratelimit:socket:${userId}`;

  // 1. Try Redis cache if available
  try {
    const { redisCache } = require('../core/config/redis-cache.client');
    if (redisCache && (redisCache.status === 'ready' || redisCache.status === 'connect')) {
      const current = await redisCache.incr(key);
      if (current === 1) {
        await redisCache.expire(key, SOCKET_WINDOW_SECONDS);
      }
      return current <= SOCKET_EVENT_LIMIT;
    }
  } catch {
    // Fall back to in-memory sliding window
  }

  // 2. In-memory sliding window fallback (fail closed if invalid)
  const now = Date.now();
  let bucket = inMemorySocketBuckets.get(userId);
  if (!bucket || now - bucket.windowStart > SOCKET_WINDOW_SECONDS * 1000) {
    bucket = { count: 1, windowStart: now };
    inMemorySocketBuckets.set(userId, bucket);
    return true;
  }

  if (bucket.count >= SOCKET_EVENT_LIMIT) {
    return false;
  }
  bucket.count += 1;
  return true;
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
      if (!Number.isFinite(decoded.exp) || decoded.exp * 1000 <= Date.now()) {
        throw new Error('Access token must have a future expiry');
      }
      socket.accessExpiresAt = decoded.exp * 1000;
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

    let expiryTimer;
    const expire = () => {
      const remaining = socket.accessExpiresAt - Date.now();
      if (remaining <= 0) return socket.disconnect(true);
      // Node timers are limited to a signed 32-bit delay.
      expiryTimer = setTimeout(expire, Math.min(remaining, 2147483647));
      expiryTimer.unref();
    };
    expire();
    // Cover revocation while the handshake was in flight, before room registration.
    void authorizeSocket(socket);

    // Enforce per-user event rate limiting
    socket.use(async ([event, ...args], next) => {
      const allowed = await checkSocketRateLimit(socket.userId);
      if (!allowed) {
        socket.emit('error', {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many socket requests. Please slow down.',
        });
        return next(new Error('Socket rate limit exceeded'));
      }
      next();
    });

    const pendingJoins = new Map();
    socket.on('chat:join', async (roomId) => {
      const id = normalizeRoomId(roomId);
      if (!id) return;
      const request = Symbol();
      pendingJoins.set(id, request);
      const allowed = await canAccessRoom(id, socket.userId) && await authorizeSocket(socket);
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
      clearTimeout(expiryTimer);
      pendingJoins.clear();
      console.log(`Socket disconnected: ${socket.userName}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

const disconnectUserSockets = (userId) => {
  if (!io || !userId) return;
  io.in(`user:${userId.toString()}`).disconnectSockets(true);
};

const emitToUser = async (userId, event, data) => {
  if (!io || !userId) return;
  const sockets = await io.in(`user:${userId.toString()}`).fetchSockets();
  await Promise.all(sockets.map(async (socket) => {
    if (await authorizeSocket(socket)) socket.emit(event, data);
  }));
};

const emitToRoom = async (roomId, event, data) => {
  if (!io || !roomId) return;
  const id = normalizeRoomId(typeof roomId === 'string' ? roomId.replace(/^chat:/, '') : null);
  if (!id) return;
  const room = `chat:${id}`;
  const sockets = await io.in(room).fetchSockets();
  await Promise.all(sockets.map(async (socket) => {
    // Recheck stored access so an existing subscription cannot outlive access.
    if (await canAccessRoom(id, socket.userId) && await authorizeSocket(socket)) {
      if (socket.rooms.has(room)) socket.emit(event, data);
    } else {
      await socket.leave(room);
    }
  }));
};

const closeChatRoom = async (roomId) => {
  const id = normalizeRoomId(roomId);
  if (!io || !id) return;
  const room = `chat:${id}`;
  // The room no longer exists. Send only its identifier, then evict subscribers.
  const sockets = await io.in(room).fetchSockets();
  await Promise.all(sockets.map(async (socket) => {
    if (await authorizeSocket(socket) && socket.rooms.has(room)) {
      socket.emit('chat:room_deleted', { roomId: id });
    }
    await socket.leave(room);
  }));
};

const emitToAll = async (event, data) => {
  if (!io) return;
  const sockets = await io.fetchSockets();
  await Promise.all(sockets.map(async (socket) => {
    if (await authorizeSocket(socket)) socket.emit(event, data);
  }));
};

module.exports = {
  initSocket,
  getIO,
  disconnectUserSockets,
  emitToUser,
  emitToRoom,
  closeChatRoom,
  emitToAll,
  checkSocketRateLimit,
  SOCKET_EVENT_LIMIT,
};
