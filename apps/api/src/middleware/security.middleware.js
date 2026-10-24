const express = require('express');

const defaultJsonParser = express.json({ limit: '100kb' }); // Reduced to prevent DoS
const avatarJsonParser = express.json({ limit: '10mb' });
const urlencodedParser = express.urlencoded({ extended: true, limit: '100kb' });

const jsonParser = (req, res, next) => {
  const url = req.originalUrl || req.url || '';
  if (url.includes('/profile/me/avatar')) {
    return avatarJsonParser(req, res, next);
  }
  return defaultJsonParser(req, res, next);
};

/**
 * NoSQL Operator Injection Sanitizer:
 * Recursively strips any keys starting with '$' or containing '.'
 * from request body, query parameters, and route parameters.
 */
const sanitizeNoSql = (obj) => {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        sanitizeNoSql(item);
      }
    }
    return;
  }
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeNoSql(obj[key]);
    }
  }
};

const noSqlSanitizer = (req, res, next) => {
  if (req.body) sanitizeNoSql(req.body);
  if (req.query) sanitizeNoSql(req.query);
  if (req.params) sanitizeNoSql(req.params);
  next();
};

const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
};

module.exports = [jsonParser, urlencodedParser, noSqlSanitizer, securityHeaders];
module.exports.sanitizeNoSql = sanitizeNoSql;
