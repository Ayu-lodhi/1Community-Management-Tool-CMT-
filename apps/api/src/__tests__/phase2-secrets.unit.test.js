const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';

const tokens = require('../modules/auth/auth.tokens');

test('Phase 2 - Startup fails without required environment variables', () => {
  const serverScript = path.resolve(__dirname, '../server.js');

  const requiredVars = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'MONGODB_URI'];
  for (const missingVar of requiredVars) {
    const env = {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://localhost:27017/dummy_db',
      REDIS_CACHE_URL: 'redis://localhost:6379/0',
      REDIS_PUBSUB_URL: 'redis://localhost:6380/1',
      REDIS_QUEUE_URL: 'redis://localhost:6381/2',
      JWT_ACCESS_SECRET: 'valid_access_secret_min_16_chars',
      JWT_REFRESH_SECRET: 'valid_refresh_secret_min_16_chars',
    };
    env[missingVar] = ''; // empty string fails Joi validation

    const res = spawnSync(process.execPath, [serverScript], {
      env,
      encoding: 'utf8',
      timeout: 8000,
    });

    assert.equal(res.status, 1, `Server must fail startup when ${missingVar} is missing`);
    const output = (res.stdout || '') + (res.stderr || '');
    assert.match(output, /FATAL CONFIG ERROR: Startup environment validation failed/);
    assert.match(output, new RegExp(missingVar));
  }
});

test('Phase 2 - Access token cannot be verified with refresh secret and vice versa', () => {
  const dummyUser = { _id: '507f1f77bcf86cd799439011', password: 'hashedpassword' };

  // Access token signed with JWT_ACCESS_SECRET
  const accessToken = tokens.sign(dummyUser, 'access', '15m');
  assert.throws(
    () => tokens.verify(accessToken, 'refresh'),
    /invalid signature|Invalid token purpose/,
    'Access token must not verify as a refresh token'
  );

  // Refresh token signed with JWT_REFRESH_SECRET
  const refreshToken = tokens.sign(dummyUser, 'refresh', '7d');
  assert.throws(
    () => tokens.verify(refreshToken, 'access'),
    /invalid signature|Invalid token purpose/,
    'Refresh token must not verify as an access token'
  );
});

test('Phase 2 - Token signed with old hardcoded fallback placeholder is rejected', () => {
  const oldPlaceholderSecret = 'OLD_FALLBACK_PLACEHOLDER_NOT_REAL_KEY_32CHARS';
  const legacyToken = jwt.sign(
    { sub: '507f1f77bcf86cd799439011', purpose: 'access' },
    oldPlaceholderSecret,
    { algorithm: 'HS256', expiresIn: '15m' }
  );

  assert.throws(
    () => tokens.verify(legacyToken, 'access'),
    /invalid signature/,
    'Tokens signed with old fallback secrets must be rejected'
  );
});

test('Phase 2 - Both token modules throw when JWT_ACCESS_SECRET or JWT_REFRESH_SECRET is missing', () => {
  const apiTokens = require('../modules/auth/auth.tokens');
  const webTokens = require('../../../web/server/modules/auth/auth.tokens');
  const modules = [
    { name: 'apps/api/src/modules/auth/auth.tokens', mod: apiTokens },
    { name: 'apps/web/server/modules/auth/auth.tokens', mod: webTokens },
  ];

  for (const { name, mod } of modules) {
    const origAccess = process.env.JWT_ACCESS_SECRET;
    const origRefresh = process.env.JWT_REFRESH_SECRET;

    try {
      delete process.env.JWT_ACCESS_SECRET;
      assert.throws(
        () => mod.sign({ _id: '123' }, 'access', '15m'),
        (err) => {
          assert.equal(err.status || err.statusCode, 500);
          assert.match(err.message, /Authentication service configuration error/);
          return true;
        },
        `${name} must throw 500 when JWT_ACCESS_SECRET is missing`
      );

      delete process.env.JWT_REFRESH_SECRET;
      process.env.JWT_ACCESS_SECRET = origAccess;
      assert.throws(
        () => mod.sign({ _id: '123' }, 'refresh', '7d'),
        (err) => {
          assert.equal(err.status || err.statusCode, 500);
          assert.match(err.message, /Authentication service configuration error/);
          return true;
        },
        `${name} must throw 500 when JWT_REFRESH_SECRET is missing`
      );
    } finally {
      process.env.JWT_ACCESS_SECRET = origAccess;
      process.env.JWT_REFRESH_SECRET = origRefresh;
    }
  }
});

test('Phase 2 - reset-demo-users refuses to run with NODE_ENV=production', () => {
  const scriptPath = path.resolve(__dirname, '../../scripts/reset-demo-users.js');
  const res = spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://localhost:27017/test_db',
    },
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.notEqual(res.status, 0, 'Script must exit non-zero when NODE_ENV is production');
  const output = (res.stdout || '') + (res.stderr || '');
  assert.match(output, /cannot be executed in production/);
});

test('Phase 2 - Static scan of apps/ source confirms NO hardcoded credentials or fallback secrets', () => {
  const targetDirs = [
    path.resolve(__dirname, '..'), // apps/api/src
    path.resolve(__dirname, '../../../web/server'),
    path.resolve(__dirname, '../../../web/api'),
    path.resolve(__dirname, '../../../web/src'),
  ];

  function scanDir(dir) {
    const files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '__tests__' ||
          entry.name === '.git' ||
          entry.name === 'dist' ||
          entry.name === 'build'
        ) {
          continue;
        }
        files.push(...scanDir(fullPath));
      } else if (
        /\.(jsx?|tsx?|mjs|cjs)$/.test(entry.name) &&
        !/\.test\./.test(entry.name) &&
        !/\.spec\./.test(entry.name) &&
        !/^test-/.test(entry.name)
      ) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const scannedFiles = targetDirs.flatMap((d) => (fs.existsSync(d) ? scanDir(d) : []));
  assert.ok(scannedFiles.length > 0, 'Must find production source files to scan');

  // Regex patterns that must NEVER match production code:
  // 1. mongodb:// or mongodb+srv:// with embedded credentials user:password@
  const embeddedCredentialsRegex = /mongodb(?:\+srv)?:\/\/[^/\s:@]+:[^/\s:@]+@/i;
  // 2. Known fallback patterns for secrets
  const fallbackSecretRegex = /process\.env\.(JWT_SECRET|JWT_ACCESS_SECRET|JWT_REFRESH_SECRET)\s*\|\|\s*['"][^'"]+['"]/;
  // 3. Fallback constant names
  const defaultSecretConstantRegex = /\b(DEFAULT_ACCESS_SECRET|DEFAULT_REFRESH_SECRET)\b/;
  // 4. Literal fallback assignment into process.env
  const fallbackAssignmentRegex = /process\.env\.(JWT_ACCESS_SECRET|JWT_REFRESH_SECRET)\s*=\s*['"][^'"]+['"]/;
  // 5. quickLogin with literal password argument
  const quickLoginLiteralRegex = /quickLogin\s*\([^)]*['"][^'"]+['"]\s*,\s*['"][^'"]+['"]\s*\)/;

  const appsDir = path.resolve(__dirname, '../../..');
  const violations = [];
  for (const file of scannedFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const rel = path.relative(appsDir, file);
    if (embeddedCredentialsRegex.test(content)) {
      violations.push(`${rel} contains embedded database credentials`);
    }
    if (fallbackSecretRegex.test(content)) {
      violations.push(`${rel} contains hardcoded JWT fallback`);
    }
    if (defaultSecretConstantRegex.test(content)) {
      violations.push(`${rel} contains DEFAULT_ACCESS_SECRET or DEFAULT_REFRESH_SECRET constant`);
    }
    if (fallbackAssignmentRegex.test(content)) {
      violations.push(`${rel} contains literal process.env fallback assignment`);
    }
    if (quickLoginLiteralRegex.test(content)) {
      violations.push(`${rel} contains quickLogin call with literal password`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Found hardcoded secrets or credentials in production files:\n${violations.join('\n')}`
  );
});
