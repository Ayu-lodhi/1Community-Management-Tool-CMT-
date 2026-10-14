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
