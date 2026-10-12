import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.config.js';
import { AuthenticationError } from '../errors/typedErrors.js';
import { redisCache } from '../config/redis-cache.client.js';

/**
 * Red-Zone File: Authentication Middleware
 * Validates JWT access token, checks revocation blacklist in Redis.
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Authorization header missing or invalid');
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, ENV.JWT_ACCESS_SECRET);
    } catch (err) {
      throw new AuthenticationError('Token expired or signature invalid');
    }

    // Check if user session has been revoked
    const isRevoked = await redisCache.get(`revoked_user:${decoded.userId}`);
    if (isRevoked) {
      throw new AuthenticationError('Session has been revoked. Please log in again.');
    }

    req.user = decoded;
    next();
  } catch (error) {
    next(error);
  }
}
