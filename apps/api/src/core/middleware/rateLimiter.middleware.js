import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisCache } from '../config/redis-cache.client.js';

/**
 * Distributed Redis-backed API Rate Limiter
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per IP/window
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redisCache.call(...args),
    prefix: 'rl:api:'
  }),
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes.'
  }
});

/**
 * Strict rate limiter for sensitive authentication routes
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redisCache.call(...args),
    prefix: 'rl:auth:'
  }),
  message: {
    success: false,
    message: 'Too many login attempts, please try again after 15 minutes.'
  }
});
