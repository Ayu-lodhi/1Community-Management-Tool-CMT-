const assert = require('node:assert/strict');
const { test } = require('node:test');
const tokens = require('../auth.tokens');

test('requiresMfa: returns false when ENFORCE_MFA is not true', async () => {
  const prev = process.env.ENFORCE_MFA;
  try {
    process.env.ENFORCE_MFA = 'false';
    assert.equal(await tokens.requiresMfa('ADMIN'), false);
    assert.equal(await tokens.requiresMfa('SUPER_ADMIN'), false);
  } finally {
    process.env.ENFORCE_MFA = prev;
  }
});

test('requiresMfa: correctly resolves privileged roles when ENFORCE_MFA is true', async () => {
  const prev = process.env.ENFORCE_MFA;
  try {
    process.env.ENFORCE_MFA = 'true';
    assert.equal(await tokens.requiresMfa('ADMIN'), true);
    assert.equal(await tokens.requiresMfa('SUPER_ADMIN'), true);
    assert.equal(await tokens.requiresMfa('T1_VOLUNTEER'), false);
    assert.equal(await tokens.requiresMfa('T2_ASSOCIATE'), false);
    assert.equal(await tokens.requiresMfa('UNKNOWN_ROLE'), false);
  } finally {
    process.env.ENFORCE_MFA = prev;
  }
});
