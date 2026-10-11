const crypto = require('crypto');

/**
 * Request ID Middleware
 * Assigns or preserves a unique UUID request identifier on every HTTP request.
 * Sets the 'x-request-id' response header and attaches req.id for tracing across
 * logs, audit records, and background queue jobs.
 */
function requestIdMiddleware(req, res, next) {
  const incomingId = req.headers['x-request-id'];
  const requestId =
    typeof incomingId === 'string' && incomingId.trim().length > 0 && incomingId.length <= 128
      ? incomingId.trim()
      : crypto.randomUUID();

  req.id = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}

module.exports = {
  requestIdMiddleware,
};
