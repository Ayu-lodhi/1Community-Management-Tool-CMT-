import { redisCache } from '../../core/config/redis-cache.client.js';

/**
 * Per-connection Rate Limiter for Socket.io
 * Prevents message flooding by enforcing a per-user message budget.
 */
export async function checkChatRateLimit(userId, maxMessages = 10, windowSeconds = 5) {
  const key = `rl:chat:${userId}`;
  const current = await redisCache.incr(key);
  if (current === 1) {
    await redisCache.expire(key, windowSeconds);
  }
  return current <= maxMessages;
}
