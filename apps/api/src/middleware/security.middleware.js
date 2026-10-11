const express = require('express');

const defaultJsonParser = express.json({ limit: '100kb' }); // M10: was 10mb — reduced to prevent DoS
const avatarJsonParser = express.json({ limit: '10mb' });
const urlencodedParser = express.urlencoded({ extended: true, limit: '100kb' });

const jsonParser = (req, res, next) => {
  const url = req.originalUrl || req.url || '';
  if (url.includes('/profile/me/avatar')) {
    return avatarJsonParser(req, res, next);
  }
  return defaultJsonParser(req, res, next);
};

const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
};

module.exports = [jsonParser, urlencodedParser, securityHeaders];
