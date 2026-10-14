process.env.VERCEL = process.env.VERCEL || '1';
let app = null;
let initError = null;

try {
  app = require('./src/server.js');
} catch (err) {
  initError = err;
  console.error('[API Serverless Init Error]:', err.message);
}

const sendJson = (res, statusCode, data) => {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(data));
};

const handler = (req, res) => {
  const url = req.url || '';

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
