// ====================================================================
// Cache-Control Security Middleware
// ====================================================================

/**
 * Middleware ensuring no caching on authenticated or sensitive responses
 */
exports.noCache = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

/**
 * Middleware applying caching ONLY to non-sensitive public endpoints
 * Fails safe: if Authorization header or authenticated user exists, forces no-store
 */
exports.publicCache = (maxAgeSeconds = 60) => (req, res, next) => {
  const hasAuth = req.headers.authorization || req.user;
  if (hasAuth) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return next();
  }

  res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 2}`);
  next();
};
