// ====================================================================
// Distributed Redis Rate Limiter with In-Memory Fallback
// ====================================================================

const { logger } = require('../core/utils/logger');

let redisCache = null;
try {
  redisCache = require('../core/config/redis-cache.client').redisCache;
  if (!redisCache) throw new Error('Redis cache is disabled or not configured');
} catch (err) {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_NO_REDIS !== 'true') {
    logger.error('Redis cache is required in production for rate limiting', { error: err.message });
    throw err;
  }
  logger.warn('Fallback to in-memory rate limiters (Redis not configured)', { error: err.message });
}

// --- In-Memory Fallback State ---
const inMemoryRequests = new Map();
const inMemoryUserCreateRequests = new Map();
const inMemoryBulkImportRequests = new Map();
const inMemoryAttendanceGenRequests = new Map();
const inMemoryAttendanceScanRequests = new Map();

const GLOBAL_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_MAX_REQUESTS = 500;

const CREATE_USER_WINDOW_MS = 60 * 1000;
const CREATE_USER_MAX_REQUESTS = 5;

const BULK_IMPORT_WINDOW_MS = 5 * 60 * 1000;
const BULK_IMPORT_MAX_REQUESTS = 10;

const ATTENDANCE_GENERATE_WINDOW_MS = 60 * 1000;
const ATTENDANCE_GENERATE_MAX_REQUESTS = 10;

const ATTENDANCE_SCAN_WINDOW_MS = 60 * 1000;
const ATTENDANCE_SCAN_MAX_REQUESTS = 30;


// Pruning interval
setInterval(() => {
  const now = Date.now();
  for (const [map, window] of [
    [inMemoryRequests, GLOBAL_WINDOW_MS],
    [inMemoryUserCreateRequests, CREATE_USER_WINDOW_MS],
    [inMemoryBulkImportRequests, BULK_IMPORT_WINDOW_MS],
    [inMemoryAttendanceGenRequests, ATTENDANCE_GENERATE_WINDOW_MS],
    [inMemoryAttendanceScanRequests, ATTENDANCE_SCAN_WINDOW_MS],
  ]) {
    for (const [key, record] of map.entries()) {
      if (now > record.resetTime) {
        map.delete(key);
      }
    }
  }
}, 60000).unref();

const getClientIdentifier = (req) => {
  if (req.user?.sub) {
    return `user:${req.user.sub}`;
  }
  return `ip:${req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'}`;
};

const handleRedisLimiter = async (req, res, next, redisKey, windowMs, maxRequests, fallbackFn, identifier, errorMsg) => {
  try {
    if (redisCache && redisCache.status === 'ready') {
      const results = await redisCache.multi().incr(redisKey).pttl(redisKey).exec();
      if (results && results[0] && !results[0][0]) {
        const count = results[0][1];
        let ttl = results[1] ? results[1][1] : -1;

        if (ttl === -1 || count === 1) {
          await redisCache.pexpire(redisKey, windowMs);
          ttl = windowMs;
        }

        const resetTimestamp = Math.ceil((Date.now() + Math.max(0, ttl)) / 1000);
        if (typeof res.setHeader === 'function') {
          res.setHeader('X-RateLimit-Limit', maxRequests);
          res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count));
          res.setHeader('X-RateLimit-Reset', resetTimestamp);
        }

        if (count > maxRequests) {
          return res.status(429).json({ success: false, message: errorMsg });
        }
        return next();
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      logger.error(`Redis limiter failed for ${redisKey}, cannot fallback to memory in production`, { error: err.message });
      return res.status(500).json({ success: false, message: 'Rate limiter unavailable' });
    }
    logger.warn(`Redis limiter failed for ${redisKey}; falling back to memory`, { error: err.message });
  }

  if (process.env.NODE_ENV === 'production') {
    logger.error(`Redis is not ready for ${redisKey}, cannot fallback to memory in production`);
    return res.status(500).json({ success: false, message: 'Rate limiter unavailable' });
  }

  return fallbackFn(req, res, next, identifier);
};

const handleMemoryLimiter = (req, res, next, map, windowMs, maxRequests, identifier, errorMsg) => {
  const now = Date.now();
  const record = map.get(identifier) || { count: 0, resetTime: now + windowMs };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
  } else {
    record.count++;
  }

  map.set(identifier, record);

  if (typeof res.setHeader === 'function') {
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));
  }

  if (record.count > maxRequests) {
    return res.status(429).json({ success: false, message: errorMsg });
  }
  next();
};

exports.globalLimiter = (req, res, next) => {
  const identifier = getClientIdentifier(req);
  return handleRedisLimiter(req, res, next, `rl:global:${identifier}`, GLOBAL_WINDOW_MS, GLOBAL_MAX_REQUESTS,
    (rq, rs, nx, id) => handleMemoryLimiter(rq, rs, nx, inMemoryRequests, GLOBAL_WINDOW_MS, GLOBAL_MAX_REQUESTS, id, 'Too many requests, please try again later.'),
    identifier, 'Too many requests, please try again later.');
};

exports.createUserLimiter = (req, res, next) => {
  const identifier = getClientIdentifier(req);
  return handleRedisLimiter(req, res, next, `rl:create_user:${identifier}`, CREATE_USER_WINDOW_MS, CREATE_USER_MAX_REQUESTS,
    (rq, rs, nx, id) => handleMemoryLimiter(rq, rs, nx, inMemoryUserCreateRequests, CREATE_USER_WINDOW_MS, CREATE_USER_MAX_REQUESTS, id, 'Too many user creation requests, please try again later.'),
    identifier, 'Too many user creation requests, please try again later.');
};

exports.bulkImportLimiter = (req, res, next) => {
  const identifier = getClientIdentifier(req);
  return handleRedisLimiter(req, res, next, `rl:bulk_import:${identifier}`, BULK_IMPORT_WINDOW_MS, BULK_IMPORT_MAX_REQUESTS,
    (rq, rs, nx, id) => handleMemoryLimiter(rq, rs, nx, inMemoryBulkImportRequests, BULK_IMPORT_WINDOW_MS, BULK_IMPORT_MAX_REQUESTS, id, 'Too many bulk import requests, please try again later.'),
    identifier, 'Too many bulk import requests, please try again later.');
};

exports.attendanceGenerateLimiter = (req, res, next) => {
  const identifier = (req.user?.sub || req.user?._id || req.user?.id || getClientIdentifier(req) || 'unknown').toString();
  return handleRedisLimiter(req, res, next, `rl:attendance_gen:${identifier}`, ATTENDANCE_GENERATE_WINDOW_MS, ATTENDANCE_GENERATE_MAX_REQUESTS,
    (rq, rs, nx, id) => handleMemoryLimiter(rq, rs, nx, inMemoryAttendanceGenRequests, ATTENDANCE_GENERATE_WINDOW_MS, ATTENDANCE_GENERATE_MAX_REQUESTS, id, 'Too many session generation requests, please try again later.'),
    identifier, 'Too many session generation requests, please try again later.');
};

exports.attendanceScanLimiter = (req, res, next) => {
  const identifier = (req.user?.sub || req.user?._id || req.user?.id || getClientIdentifier(req) || 'unknown').toString();
  return handleRedisLimiter(req, res, next, `rl:attendance_scan:${identifier}`, ATTENDANCE_SCAN_WINDOW_MS, ATTENDANCE_SCAN_MAX_REQUESTS,
    (rq, rs, nx, id) => handleMemoryLimiter(rq, rs, nx, inMemoryAttendanceScanRequests, ATTENDANCE_SCAN_WINDOW_MS, ATTENDANCE_SCAN_MAX_REQUESTS, id, 'Too many attendance submissions, please try again later.'),
    identifier, 'Too many attendance submissions, please try again later.');
};


exports._inMemoryAttendanceGenRequests = inMemoryAttendanceGenRequests;
exports._inMemoryAttendanceScanRequests = inMemoryAttendanceScanRequests;

