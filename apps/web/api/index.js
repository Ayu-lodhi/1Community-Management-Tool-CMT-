import { createRequire } from 'node:module';
import mongoose from 'mongoose';

const require = createRequire(import.meta.url);

let app = null;
let initError = null;

try {
  process.env.VERCEL = '1';

  // Auto-fallback to memory rate-limiting if Redis is not configured in Vercel yet
  if (!process.env.REDIS_CACHE_URL) {
    process.env.ALLOW_NO_REDIS = 'true';
  }

  app = require('../server/server.js');
} catch (e) {
  initError = e;
  console.error('[Serverless Startup Error]: Failed to load server.js:', e.message);
  if (e.stack) {
    console.error(e.stack);
  }
}

// Global cached connection for serverless invocation reuse
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const REQUIRED_ENV_VARS = process.env.ALLOW_NO_REDIS === 'true'
  ? ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']
  : [
      'MONGODB_URI',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'REDIS_CACHE_URL',
      'REDIS_PUBSUB_URL',
      'REDIS_QUEUE_URL'
    ];

function getMissingEnvVars() {
  return REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
}

async function connectToDatabase() {
  if (mongoose.connection?.readyState === 1) {
    return mongoose.connection;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[Serverless DB Error]: MONGODB_URI environment variable is not defined');
    return null;
  }

  // If uninitialized, disconnected, or disconnecting, initiate a fresh connection
  if (!cached.promise || mongoose.connection.readyState === 0 || mongoose.connection.readyState === 3) {
    console.log('[Serverless DB]: Initiating connection to MongoDB...');
    cached.promise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 8000,
      })
      .then((m) => {
        console.log('[Serverless DB]: Connected to MongoDB');
        cached.conn = m;
        return m;
      })
      .catch((err) => {
        cached.promise = null;
        console.error('[Serverless DB Error]: Failed to connect to MongoDB:', err.message);
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
  }

  // If connection is in connecting state (readyState === 2), wait for it to open
  if (mongoose.connection.readyState === 2) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 4000);
      mongoose.connection.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      mongoose.connection.once('error', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  return mongoose.connection;
}

export default async function handler(req, res) {
  const url = req.url || '';

  // 1. Health check endpoint — works unconditionally even if initError occurred
  if (
    url === '/api/health' ||
    url === '/health' ||
    url.startsWith('/api/health?') ||
    url.startsWith('/health?')
  ) {
    const missingEnvs = getMissingEnvVars();
    try {
      await connectToDatabase();
    } catch (_) {}

    const dbConnected = mongoose.connection.readyState === 1;
    const isHealthy = dbConnected && missingEnvs.length === 0 && !initError;

    return res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      dbConnected,
      dbReadyState: mongoose.connection.readyState,
      missingEnvVars: missingEnvs,
      initError: initError ? initError.message : null,
      timestamp: new Date().toISOString(),
    });
  }

  // 2. Fatal server module initialization error
  if (initError) {
    const missingEnvs = getMissingEnvVars();
    console.error('[Serverless Request Error]: Cannot service request due to initError:', initError.message);
    return res.status(503).json({
      success: false,
      message: 'Service is temporarily unavailable. Server failed to initialize.',
      error: initError.message,
      missingEnvVars: missingEnvs,
    });
  }

  // 2b. Missing required environment variables
  const missingEnvs = getMissingEnvVars();
  if (missingEnvs.length > 0) {
    console.error('[Serverless Request Error]: Missing required environment variables:', missingEnvs.join(', '));
    return res.status(503).json({
      success: false,
      message: 'Service is temporarily unavailable due to server configuration error.',
    });
  }

  // 3. Connect to database lazily before routing request
  await connectToDatabase();

  // 4. Normalize URL path for Express router if needed
  if (req.url && !req.url.startsWith('/api') && req.url.startsWith('/v1')) {
    req.url = '/api' + req.url;
  }

  // 5. Delegate request to Express app
  try {
    return app(req, res);
  } catch (err) {
    console.error('[Serverless Request Unhandled Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred. Please try again shortly.',
    });
  }
}
