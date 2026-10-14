const assert = require('node:assert/strict');
const { test, describe } = require('node:test');
const securityMiddleware = require('../middleware/security.middleware');
const { auditLog } = require('../middleware/audit.middleware');
const AuditLog = require('../models/AuditLog.model');

describe('Security Hardening & Protection Tests', () => {
  const sanitizeNoSql = securityMiddleware.sanitizeNoSql;

  test('NoSQL Sanitizer: strips top-level operator keys starting with $', () => {
    const maliciousPayload = {
      $gt: '',
      $ne: null,
      email: 'user@example.com',
      role: 'ADMIN',
    };
    sanitizeNoSql(maliciousPayload);

    assert.equal(maliciousPayload.$gt, undefined, '$gt operator must be deleted');
    assert.equal(maliciousPayload.$ne, undefined, '$ne operator must be deleted');
    assert.equal(maliciousPayload.email, 'user@example.com', 'Legitimate email must remain');
    assert.equal(maliciousPayload.role, 'ADMIN', 'Legitimate role must remain');
  });

  test('NoSQL Sanitizer: strips keys containing dot notation', () => {
    const payload = {
      'profile.admin': true,
      username: 'legitUser',
    };
    sanitizeNoSql(payload);

    assert.equal(payload['profile.admin'], undefined, 'Key with dot notation must be stripped');
    assert.equal(payload.username, 'legitUser');
  });

  test('NoSQL Sanitizer: recursively sanitizes nested objects and arrays', () => {
    const nestedPayload = {
      user: {
        $where: 'sleep(5000)',
        name: 'Normal User',
        permissions: [
          { $regex: '.*', validPermission: 'events:read' },
          { validGrant: 'chat:read' },
        ],
      },
    };
    sanitizeNoSql(nestedPayload);

    assert.equal(nestedPayload.user.$where, undefined);
    assert.equal(nestedPayload.user.name, 'Normal User');
    assert.equal(nestedPayload.user.permissions[0].$regex, undefined);
    assert.equal(nestedPayload.user.permissions[0].validPermission, 'events:read');
  });

  test('Security Headers: attaches all OWASP protection headers', () => {
    const headers = {};
    const mockRes = {
      setHeader: (name, val) => {
        headers[name.toLowerCase()] = val;
      },
    };

    const securityHeadersFn = securityMiddleware[3];
    let nextCalled = false;
    securityHeadersFn({}, mockRes, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['x-frame-options'], 'DENY');
    assert.equal(headers['x-xss-protection'], '1; mode=block');
    assert.equal(headers['strict-transport-security'], 'max-age=31536000; includeSubDomains');
    assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.equal(headers['permissions-policy'], 'camera=(), microphone=(), geolocation=()');
  });

  test('AuditLog Redaction: masks passwords, tokens, and secrets from audit entries', async (t) => {
    let capturedDetails = null;
    t.mock.method(AuditLog, 'create', async (doc) => {
      capturedDetails = doc.details;
      return true;
    });

    const listeners = {};
    const mockRes = {
      statusCode: 200,
      on: (event, cb) => { listeners[event] = cb; },
    };

    const mockReq = {
      user: { sub: 'u123', name: 'Admin' },
      ip: '127.0.0.1',
      params: { id: 'user456' },
      body: {
        username: 'alice',
        password: 'SuperSecretPassword123!',
        token: 'secret-auth-token-xyz',
        mfa: '123456',
        profile: {
          bio: 'Public bio',
          email_pass: 'smtpSecretPassword',
        },
      },
    };

    const middleware = auditLog('USER_PASSWORD_CHANGE');
    middleware(mockReq, mockRes, () => {});

    // Trigger response finish event
    await listeners.finish();

    assert.ok(capturedDetails, 'AuditLog.create must be called');
    assert.equal(capturedDetails.body.username, 'alice');
    assert.equal(capturedDetails.body.password, '[REDACTED]', 'Password must be redacted');
    assert.equal(capturedDetails.body.token, '[REDACTED]', 'Token must be redacted');
    assert.equal(capturedDetails.body.mfa, '[REDACTED]', 'MFA code must be redacted');
    assert.equal(capturedDetails.body.profile.bio, 'Public bio', 'Public fields must remain intact');
    assert.equal(capturedDetails.body.profile.email_pass, '[REDACTED]', 'Nested email password must be redacted');
  });
});
