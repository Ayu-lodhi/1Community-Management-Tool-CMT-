import { checkChatRateLimit } from './chat.rateLimiter.js';
import { logger } from '../../core/utils/logger.js';

export function setupChatSocket(io) {
  const chatNamespace = io.of('/chat');

  chatNamespace.use((socket, next) => {
    // Authenticate socket handshake using JWT
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }
    socket.userId = socket.handshake.auth.userId;
    next();
  });

  chatNamespace.on('connection', (socket) => {
    logger.info(`Chat client connected: ${socket.id} (User: ${socket.userId})`);

    socket.on('join_room', ({ roomId }) => {
      socket.join(roomId);
      logger.debug(`User ${socket.userId} joined chat room: ${roomId}`);
    });

    socket.on('send_message', async ({ roomId, message }) => {
      const allowed = await checkChatRateLimit(socket.userId);
      if (!allowed) {
        socket.emit('error', { message: 'Message rate limit exceeded. Slow down.' });
        return;
      }

      chatNamespace.to(roomId).emit('new_message', {
        userId: socket.userId,
        message,
        timestamp: new Date()
      });
    });

    socket.on('disconnect', () => {
      logger.info(`Chat client disconnected: ${socket.id}`);
    });
  });
}
