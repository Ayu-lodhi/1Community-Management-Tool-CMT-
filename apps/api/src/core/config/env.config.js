const dotenv = require('dotenv');
dotenv.config();

const requireEnv = (name) => {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return val;
};

const ENV = Object.freeze({
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  get MONGODB_URI() { return requireEnv('MONGODB_URI'); },
  get REDIS_CACHE_URL() { return process.env.ALLOW_NO_REDIS === 'true' ? process.env.REDIS_CACHE_URL : requireEnv('REDIS_CACHE_URL'); },
  get REDIS_PUBSUB_URL() { return process.env.ALLOW_NO_REDIS === 'true' ? process.env.REDIS_PUBSUB_URL : requireEnv('REDIS_PUBSUB_URL'); },
  get REDIS_QUEUE_URL() { return process.env.ALLOW_NO_REDIS === 'true' ? process.env.REDIS_QUEUE_URL : requireEnv('REDIS_QUEUE_URL'); },
  get JWT_ACCESS_SECRET() { return requireEnv('JWT_ACCESS_SECRET'); },
  get JWT_REFRESH_SECRET() { return requireEnv('JWT_REFRESH_SECRET'); },
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || '15m',
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '7d'
});

module.exports = { ENV };
module.exports.ENV = ENV;

