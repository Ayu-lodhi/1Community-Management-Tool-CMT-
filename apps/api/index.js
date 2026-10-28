process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '64';
process.env.VERCEL = process.env.VERCEL || '1';
const mongoose = require('mongoose');
let app = null;
let initError = null;

try {
  app = require('./src/server.js');
} catch (err) {
  initError = err;
  console.error('[API Serverless Init Error]:', err.message);
}

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

let lastDbError = null;
let lastDbErrorStack = null;

const normalizeMongoUri = (rawUri) => {
  if (!rawUri || typeof rawUri !== 'string') return rawUri;
  if (rawUri.startsWith('mongodb+srv://') && rawUri.includes('-shard-00-00.')) {
    try {
      const prefix = rawUri.replace('mongodb+srv://', 'mongodb://');
      const [userPart, rest] = prefix.split('@');
      if (rest) {
        const [hostPart, queryPart] = rest.split('/');
        const baseDomain = hostPart.replace('ac-gkiqwag-shard-00-00.', '');
        const hosts = ['00-00', '00-01', '00-02'].map((s) => `ac-gkiqwag-shard-${s}.${baseDomain}:27017`).join(',');
        const dbAndQuery = queryPart || 'tbi_db';
        const sep = dbAndQuery.includes('?') ? '&' : '?';
        return `${userPart}@${hosts}/${dbAndQuery}${dbAndQuery.includes('ssl=') ? '' : `${sep}ssl=true&replicaSet=atlas-6g5sz6-shard-0&authSource=admin`}`;
      }
    } catch (_) {}
  }
  return rawUri;
};

async function connectToDatabase() {
  if (mongoose.connection?.readyState === 1) {
    return mongoose.connection;
  }
  const rawUri = process.env.MONGODB_URI;
  if (!rawUri) return null;
  const uri = normalizeMongoUri(rawUri);

  if (!cached.promise || mongoose.connection.readyState === 0 || mongoose.connection.readyState === 3) {
    cached.promise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || '10', 10),
    }).then((m) => {
      cached.conn = m;
      lastDbError = null;
      lastDbErrorStack = null;
      return m;
    }).catch((err) => {
      cached.promise = null;
      lastDbError = err.message;
      lastDbErrorStack = err.stack;
      console.error('[MongoDB Connect Error]:', err.message);
      throw err;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    lastDbError = err.message;
    lastDbErrorStack = err.stack;
  }

  if (mongoose.connection.readyState === 2) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 4000);
      mongoose.connection.once('open', () => { clearTimeout(timer); resolve(); });
      mongoose.connection.once('error', (err) => { clearTimeout(timer); lastDbError = err?.message || 'Error'; lastDbErrorStack = err?.stack || null; resolve(); });
    });
  }
  return mongoose.connection;
}

const sendJson = (res, statusCode, data) => {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(data));
};

const handler = async (req, res) => {
  const url = req.url || '';

  if (url === '/api/db-status' || url === '/db-status') {
    if (process.env.NODE_ENV === 'production') {
      return sendJson(res, 404, { success: false, message: 'Route not found' });
    }
    await connectToDatabase().catch(() => {});
    return sendJson(res, 200, {
      readyState: mongoose.connection.readyState,
      connected: mongoose.connection.readyState === 1,
      lastDbError: lastDbError ? 'Database connection failure' : null,
      has_MONGODB_URI: Boolean(process.env.MONGODB_URI),
    });
  }

  if (initError) {
    return sendJson(res, 503, {
      success: false,
      message: initError.message || 'API service configuration error.',
      error: initError.message,
      has_MONGODB_URI: Boolean(process.env.MONGODB_URI),
      has_JWT_ACCESS_SECRET: Boolean(process.env.JWT_ACCESS_SECRET),
      has_JWT_REFRESH_SECRET: Boolean(process.env.JWT_REFRESH_SECRET),
      vercel_project_name: process.env.VERCEL_PROJECT_NAME || 'unknown',
    });
  }

  try {
    await connectToDatabase();
    return app(req, res);
  } catch (err) {
    console.error('[API Serverless Request Error]:', err);
    return sendJson(res, 500, {
      success: false,
      message: 'An unexpected server error occurred.',
      error: err.message,
    });
  }
};

const PORT = process.env.PORT || 5000;
if (require.main === module && app && typeof app.listen === 'function') {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = handler;
