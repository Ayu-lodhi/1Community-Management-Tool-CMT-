const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');
const mongoose = require('mongoose');

// ====================================================================
// CRYPTO HELPERS (Identical algorithm, IV, and serialization as mfa.service.js)
// ====================================================================

const parseKey = (keyHex, name = 'Key') => {
  if (!keyHex || !/^[a-f\d]{64}$/i.test(keyHex.trim())) {
    throw new Error(`${name} must be a 64-character hexadecimal string`);
  }
  return Buffer.from(keyHex.trim(), 'hex');
};

const encryptWithKey = (secret, keyBuffer) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.');
};

const decryptWithKey = (value, keyBuffer) => {
  if (typeof value !== 'string') throw new Error('Invalid encrypted value format');
  const parts = value.split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted structure');
  const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', keyBuffer, iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8');
};

// ====================================================================
// VALIDATION & GUARDS
// ====================================================================

const getMongoHost = (uri) => {
  try {
    const match = uri.match(/mongodb(?:\+srv)?:\/\/(?:[^@/]+@)?([^/:?]+)/i);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
};

const validateEnvironment = (env = process.env) => {
  if (env.NODE_ENV === 'production' && env.ALLOW_PRODUCTION_MFA_ROTATION !== 'yes') {
    console.error('FATAL: rotate-mfa-key cannot be executed in production environment without ALLOW_PRODUCTION_MFA_ROTATION=yes.');
    process.exit(1);
  }

  const oldKeyHex = env.OLD_MFA_ENCRYPTION_KEY;
  const newKeyHex = env.NEW_MFA_ENCRYPTION_KEY;

  if (!oldKeyHex) {
    console.error('FATAL: OLD_MFA_ENCRYPTION_KEY environment variable is required.');
    process.exit(1);
  }
  if (!newKeyHex) {
    console.error('FATAL: NEW_MFA_ENCRYPTION_KEY environment variable is required.');
    process.exit(1);
  }

  let oldKeyBuffer;
  let newKeyBuffer;
  try {
    oldKeyBuffer = parseKey(oldKeyHex, 'OLD_MFA_ENCRYPTION_KEY');
    newKeyBuffer = parseKey(newKeyHex, 'NEW_MFA_ENCRYPTION_KEY');
  } catch (err) {
    console.error(`FATAL: ${err.message}`);
    process.exit(1);
  }

  if (oldKeyHex.trim().toLowerCase() === newKeyHex.trim().toLowerCase()) {
    console.error('FATAL: OLD_MFA_ENCRYPTION_KEY and NEW_MFA_ENCRYPTION_KEY must be different.');
    process.exit(1);
  }

  const uri = env.MONGODB_URI;
  if (!uri) {
    console.error('FATAL: MONGODB_URI environment variable is required.');
    process.exit(1);
  }

  const allowedHosts = ['localhost', '127.0.0.1', 'mongodb', 'tbi_mongo'];
  const host = getMongoHost(uri);
  if (env.ALLOW_NON_LOCAL_ROTATION !== 'yes') {
    if (!host || !allowedHosts.includes(host)) {
      console.error(
        `FATAL: rotate-mfa-key can only target local MongoDB (${allowedHosts.join(', ')}). Target host is '${host || 'unknown'}'. Set ALLOW_NON_LOCAL_ROTATION=yes to override.`
      );
      process.exit(1);
    }
  }

  return { oldKeyBuffer, newKeyBuffer, uri, isDryRun: env.APPLY !== 'yes' };
};

// ====================================================================
// MIGRATION WORKER
// ====================================================================

/**
 * Rotates MFA secrets in batch.
 * Operates on any user collection or mocked collection conforming to { find, updateOne }.
 */
async function rotateUserSecrets({ usersCol, oldKeyBuffer, newKeyBuffer, isDryRun = true, batchSize = 50 }) {
  console.log('------------------------------------------------------------');
  console.log(`MODE: ${isDryRun ? 'DRY-RUN (no database writes)' : 'APPLY (writing to database)'}`);
  console.log('SAFETY NOTICE: Ensure the "users" collection is backed up before applying migration (e.g. mongodump).');
  console.log('------------------------------------------------------------');

  const query = { 'mfa.secret': { $exists: true, $ne: null } };
  const cursor = typeof usersCol.find === 'function' ? usersCol.find(query) : [];

  let users = [];
  if (Array.isArray(cursor)) {
    users = cursor;
  } else if (typeof cursor.toArray === 'function') {
    users = await cursor.toArray();
  } else if (typeof cursor[Symbol.asyncIterator] === 'function') {
    for await (const doc of cursor) {
      users.push(doc);
    }
  }

  const summary = {
    totalScanned: users.length,
    alreadyMigrated: 0,
    migrated: 0,
    failed: 0,
  };

  console.log(`Found ${users.length} user records with MFA configured.`);

  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);

    for (const user of batch) {
      const userIdStr = String(user._id);
      const currentSecret = user.mfa?.secret;

      if (!currentSecret) continue;

      // 1. Idempotency Check: does it already decrypt with newKey?
      try {
        decryptWithKey(currentSecret, newKeyBuffer);
        summary.alreadyMigrated++;
        console.log(`[IDEMPOTENT SKIP] User ${userIdStr}: Secret already matches new key.`);
        continue;
      } catch (_) {
        // Not yet encrypted with new key, proceed with migration
      }

      // 2. Decrypt with oldKey
      let plaintext;
      try {
        plaintext = decryptWithKey(currentSecret, oldKeyBuffer);
      } catch (err) {
        summary.failed++;
        console.warn(`[WARN UNCHANGED] User ${userIdStr}: Decryption with OLD key failed. Record left untouched.`);
        continue;
      }

      // 3. Re-encrypt with newKey
      let newEncrypted;
      try {
        newEncrypted = encryptWithKey(plaintext, newKeyBuffer);
      } catch (err) {
        summary.failed++;
        console.warn(`[WARN UNCHANGED] User ${userIdStr}: Encryption with NEW key failed. Record left untouched.`);
        continue;
      }

      // 4. Verify round-trip before writing
      try {
        const verifiedPlaintext = decryptWithKey(newEncrypted, newKeyBuffer);
        if (verifiedPlaintext !== plaintext) {
          throw new Error('Verification mismatch');
        }
      } catch (err) {
        summary.failed++;
        console.warn(`[WARN UNCHANGED] User ${userIdStr}: Round-trip verification failed. Record left untouched.`);
        continue;
      }

      // 5. Apply update if not dry-run
      if (!isDryRun) {
        try {
          await usersCol.updateOne(
            { _id: user._id },
            { $set: { 'mfa.secret': newEncrypted, 'mfa.updatedAt': new Date() } }
          );
          summary.migrated++;
          console.log(`[MIGRATED] User ${userIdStr}: Updated with new key.`);
        } catch (err) {
          summary.failed++;
          console.warn(`[WARN UNCHANGED] User ${userIdStr}: Database update failed. Record left untouched.`);
        }
      } else {
        summary.migrated++;
        console.log(`[DRY-RUN VERIFIED] User ${userIdStr}: Can be migrated safely.`);
      }
    }
  }

  console.log('------------------------------------------------------------');
  console.log('MFA KEY ROTATION SUMMARY:');
  console.log(`- Total Scanned:       ${summary.totalScanned}`);
  console.log(`- Already Migrated:    ${summary.alreadyMigrated}`);
  console.log(`- Successfully ${isDryRun ? 'Simulated' : 'Migrated'}: ${summary.migrated}`);
  console.log(`- Failed / Untouched:  ${summary.failed}`);
  console.log('------------------------------------------------------------');

  return summary;
}

// ====================================================================
// CLI EXECUTION
// ====================================================================

async function main() {
  const { oldKeyBuffer, newKeyBuffer, uri, isDryRun } = validateEnvironment(process.env);

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const usersCol = mongoose.connection.collection('users');

  try {
    await rotateUserSecrets({
      usersCol,
      oldKeyBuffer,
      newKeyBuffer,
      isDryRun,
    });
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('FATAL ERROR:', err.message);
    process.exit(1);
  });
}

module.exports = {
  parseKey,
  encryptWithKey,
  decryptWithKey,
  validateEnvironment,
  rotateUserSecrets,
};
