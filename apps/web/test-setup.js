// Central test setup for apps/web tests
process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) {
  process.env.JWT_ACCESS_SECRET = 'test_access_jwt_secret_min_32_characters_long';
}
if (!process.env.JWT_REFRESH_SECRET) {
  process.env.JWT_REFRESH_SECRET = 'test_refresh_jwt_secret_min_32_characters_long';
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = process.env.JWT_ACCESS_SECRET;
}
if (!process.env.REDIS_CACHE_URL) {
  process.env.REDIS_CACHE_URL = 'redis://localhost:6379';
}

try {
  const mongoose = require('mongoose');
  if (mongoose.connection && mongoose.connection.readyState === 0) {
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true, writable: true });
  }
} catch (_) {}
