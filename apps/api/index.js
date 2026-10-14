process.env.VERCEL = process.env.VERCEL || '1';
let app = null;
let initError = null;

try {
  app = require('./src/server.js');
} catch (err) {
  initError = err;
  console.error('[API Serverless Init Error]:', err.message);
}

const handler = (req, res) => {
  const url = req.url || '';
  if (
    url === '/api/health' ||
    url === '/health' ||
    url.startsWith('/api/health?') ||
    url.startsWith('/health?')
  ) {
    return res.status(200).json({
      status: initError ? 'error' : 'ok',
      has_MONGODB_URI: Boolean(process.env.MONGODB_URI),
      mongodb_uri_length: process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0,
      has_JWT_ACCESS_SECRET: Boolean(process.env.JWT_ACCESS_SECRET),
      jwt_access_secret_length: process.env.JWT_ACCESS_SECRET ? process.env.JWT_ACCESS_SECRET.length : 0,
      has_JWT_REFRESH_SECRET: Boolean(process.env.JWT_REFRESH_SECRET),
      jwt_refresh_secret_length: process.env.JWT_REFRESH_SECRET ? process.env.JWT_REFRESH_SECRET.length : 0,
      secrets_are_different: process.env.JWT_ACCESS_SECRET !== process.env.JWT_REFRESH_SECRET,
      has_ALLOW_NO_REDIS: Boolean(process.env.ALLOW_NO_REDIS),
      vercel_project_name: process.env.VERCEL_PROJECT_NAME || 'unknown',
      detected_keys: Object.keys(process.env).filter(k => !k.startsWith('npm_') && !k.startsWith('AWS_') && !k.startsWith('_')).sort(),
      initError: initError ? initError.message : null,
      timestamp: new Date().toISOString(),
    });
  }

  if (initError) {
    return res.status(503).json({
      success: false,
      message: initError.message || 'API service configuration error.',
      error: initError.message,
    });
  }
  return app(req, res);
};

const PORT = process.env.PORT || 5000;
if (require.main === module && app && typeof app.listen === 'function') {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = handler;
