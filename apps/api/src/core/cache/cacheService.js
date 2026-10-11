import { redisCache } from '../config/redis-cache.client.js';
import { logger } from '../utils/logger.js';

export class CacheService {
  static async get(key) {
    try {
      const data = await redisCache.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      logger.warn(`Cache get failed for key: ${key}`, { error: err.message });
      return null;
    }
  }

  static async set(key, value, ttlSeconds = 3600) {
    try {
      await redisCache.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      logger.warn(`Cache set failed for key: ${key}`, { error: err.message });
    }
  }
}
