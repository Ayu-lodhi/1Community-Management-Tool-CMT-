// ====================================================================
// Structured Logger with Sensitive Field Redaction
// ====================================================================

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordconfirmation',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'cookies',
  'secret',
  'mfa',
  'totp',
  'otp',
  'jwt_access_secret',
  'jwt_refresh_secret',
  'email_pass',
]);

function redactObject(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return obj;
  if (Array.isArray(obj)) return obj.map((item) => redactObject(item, depth + 1));

  const redacted = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactObject(value, depth + 1);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const safeMeta = redactObject(meta);
  const entry = {
    timestamp,
    level,
    message: typeof message === 'string' ? message : JSON.stringify(message),
    ...(safeMeta && Object.keys(safeMeta).length > 0 ? { meta: safeMeta } : {}),
  };

  const formatted = process.env.NODE_ENV === 'production'
    ? JSON.stringify(entry)
    : `[${timestamp}] [${level.toUpperCase()}] ${entry.message} ${entry.meta ? JSON.stringify(entry.meta) : ''}`.trim();

  if (level === 'error') {
    console.error(formatted);
  } else if (level === 'warn') {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}

const logger = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta),
};

// CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { logger, redactObject };
  module.exports.logger = logger;
  module.exports.redactObject = redactObject;
}
