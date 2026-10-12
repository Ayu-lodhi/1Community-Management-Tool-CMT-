const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeAuditValue } = require('../auditLogger');

test('Audit Logger - removes passwords, secrets, tokens and PII from audit details', () => {
  const dirtyDetails = {
    role: 'ADMIN',
    customGrants: ['CAN_VIEW_REPORTS', 'CAN_EXPORT_DATA'],
    password: 'super_secret_plain_text',
    token: 'jwt_token_12345',
    email: 'user@example.com',
    phone: '+1234567890',
    meta: {
      nestedSecret: 'hidden_pass',
      safeKey: 'valid_value',
    },
  };

  const clean = sanitizeAuditValue(dirtyDetails);

  assert.equal(clean.role, 'ADMIN');
  assert.deepEqual(clean.customGrants, ['CAN_VIEW_REPORTS', 'CAN_EXPORT_DATA']);
  assert.equal(clean.password, undefined);
  assert.equal(clean.token, undefined);
  assert.equal(clean.email, undefined);
  assert.equal(clean.phone, undefined);
  assert.equal(clean.meta.nestedSecret, undefined);
  assert.equal(clean.meta.safeKey, 'valid_value');
});
