const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const {
  parseKey,
  encryptWithKey,
  decryptWithKey,
  rotateUserSecrets,
} = require('../../scripts/rotate-mfa-key');

const OLD_KEY_HEX = '1111111111111111111111111111111111111111111111111111111111111111';
const NEW_KEY_HEX = '2222222222222222222222222222222222222222222222222222222222222222';
const WRONG_KEY_HEX = '9999999999999999999999999999999999999999999999999999999999999999';

const oldKeyBuffer = parseKey(OLD_KEY_HEX);
const newKeyBuffer = parseKey(NEW_KEY_HEX);
const wrongKeyBuffer = parseKey(WRONG_KEY_HEX);

function createMockCollection(initialDocs = []) {
  const docs = JSON.parse(JSON.stringify(initialDocs));
  const updates = [];

  return {
    docs,
    updates,
    find: () => ({
      toArray: async () => docs.map((d) => JSON.parse(JSON.stringify(d))),
    }),
    updateOne: async (filter, update) => {
      updates.push({ filter, update });
      const target = docs.find((d) => String(d._id) === String(filter._id));
      if (target && update.$set) {
        if (update.$set['mfa.secret']) {
          target.mfa = target.mfa || {};
          target.mfa.secret = update.$set['mfa.secret'];
        }
      }
      return { acknowledged: true, modifiedCount: 1 };
    },
  };
}

test('rotate-mfa-key: round-trip migration works with verified decryption', async () => {
  const originalPlaintext = 'JBSWY3DPEHPK3PXP';
  const initialSecret = encryptWithKey(originalPlaintext, oldKeyBuffer);

  const mockUsers = [
    { _id: '507f1f77bcf86cd799439011', mfa: { secret: initialSecret } },
    { _id: '507f1f77bcf86cd799439022', mfa: { secret: encryptWithKey('ANOTHERSECRET123', oldKeyBuffer) } },
  ];

  const usersCol = createMockCollection(mockUsers);

  const result = await rotateUserSecrets({
    usersCol,
    oldKeyBuffer,
    newKeyBuffer,
    isDryRun: false,
  });

  assert.equal(result.totalScanned, 2);
  assert.equal(result.migrated, 2);
  assert.equal(result.failed, 0);
  assert.equal(result.alreadyMigrated, 0);
  assert.equal(usersCol.updates.length, 2);

  // Verify the updated secret decrypts with newKey and equals original plaintext
  const updatedDoc = usersCol.docs.find((d) => d._id === '507f1f77bcf86cd799439011');
  const decryptedWithNew = decryptWithKey(updatedDoc.mfa.secret, newKeyBuffer);
  assert.equal(decryptedWithNew, originalPlaintext);

  // Assert it can NO LONGER decrypt with old key
  assert.throws(() => decryptWithKey(updatedDoc.mfa.secret, oldKeyBuffer));
});

test('rotate-mfa-key: idempotent on second run (skips already migrated)', async () => {
  const originalPlaintext = 'JBSWY3DPEHPK3PXP';
  const newSecret = encryptWithKey(originalPlaintext, newKeyBuffer);

  const mockUsers = [
    { _id: '507f1f77bcf86cd799439011', mfa: { secret: newSecret } },
  ];

  const usersCol = createMockCollection(mockUsers);

  const result = await rotateUserSecrets({
    usersCol,
    oldKeyBuffer,
    newKeyBuffer,
    isDryRun: false,
  });

  assert.equal(result.totalScanned, 1);
  assert.equal(result.alreadyMigrated, 1);
  assert.equal(result.migrated, 0);
  assert.equal(result.failed, 0);
  assert.equal(usersCol.updates.length, 0, 'No DB updates should occur on already migrated users');
});

test('rotate-mfa-key: wrong old key leaves records unchanged and increments failure count', async () => {
  const originalPlaintext = 'JBSWY3DPEHPK3PXP';
  const initialSecret = encryptWithKey(originalPlaintext, oldKeyBuffer);

  const mockUsers = [
    { _id: '507f1f77bcf86cd799439011', mfa: { secret: initialSecret } },
  ];

  const usersCol = createMockCollection(mockUsers);

  const result = await rotateUserSecrets({
    usersCol,
    oldKeyBuffer: wrongKeyBuffer, // Passing wrong old key
    newKeyBuffer,
    isDryRun: false,
  });

  assert.equal(result.totalScanned, 1);
  assert.equal(result.alreadyMigrated, 0);
  assert.equal(result.migrated, 0);
  assert.equal(result.failed, 1);
  assert.equal(usersCol.updates.length, 0, 'No DB updates should occur on failed decryption');

  // Verify the record is completely unchanged
  assert.equal(usersCol.docs[0].mfa.secret, initialSecret);
});

test('rotate-mfa-key: dry-run verifies migration without changing any database records', async () => {
  const originalPlaintext = 'JBSWY3DPEHPK3PXP';
  const initialSecret = encryptWithKey(originalPlaintext, oldKeyBuffer);

  const mockUsers = [
    { _id: '507f1f77bcf86cd799439011', mfa: { secret: initialSecret } },
  ];

  const usersCol = createMockCollection(mockUsers);

  const result = await rotateUserSecrets({
    usersCol,
    oldKeyBuffer,
    newKeyBuffer,
    isDryRun: true,
  });

  assert.equal(result.totalScanned, 1);
  assert.equal(result.migrated, 1, 'Dry-run counts verified migrations');
  assert.equal(result.failed, 0);
  assert.equal(usersCol.updates.length, 0, 'Zero writes must occur during dry-run');
  assert.equal(usersCol.docs[0].mfa.secret, initialSecret, 'Records must remain untouched');
});

test('rotate-mfa-key: production guard exits non-zero before attempting any database connection', () => {
  const scriptPath = path.resolve(__dirname, '../../scripts/rotate-mfa-key.js');
  const res = spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      OLD_MFA_ENCRYPTION_KEY: OLD_KEY_HEX,
      NEW_MFA_ENCRYPTION_KEY: NEW_KEY_HEX,
      MONGODB_URI: 'mongodb://localhost:27017/test_db',
    },
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.notEqual(res.status, 0, 'Script must exit non-zero when NODE_ENV is production without override flag');
  const output = (res.stdout || '') + (res.stderr || '');
  assert.match(output, /cannot be executed in production environment/);
});
