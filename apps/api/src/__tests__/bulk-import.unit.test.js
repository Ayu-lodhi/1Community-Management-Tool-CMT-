const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
process.env.REDIS_CACHE_URL = 'redis://localhost:6379/0';
process.env.REDIS_PUBSUB_URL = 'redis://localhost:6379/1';
process.env.REDIS_QUEUE_URL = 'redis://localhost:6379/2';

// Intercept nodemailer to guarantee no network or ethereal email traffic
nodemailer.createTransport = () => ({
  sendMail: async () => ({ messageId: 'mock-mail-id' }),
});
nodemailer.createTestAccount = async () => ({
  user: 'mock@ethereal.test',
  pass: 'mockpass',
});

// ----------------------------------------------------------------------
// Load Frontend parseCSV implementation from apps/web/src/pages.jsx
// ----------------------------------------------------------------------
const pagesPath = path.resolve(__dirname, '../../../../apps/web/src/pages.jsx');
const pagesSource = fs.readFileSync(pagesPath, 'utf8');
const parserMatch = pagesSource.match(/  const parseCSV = \(text\) => \{[\s\S]*?\n  \};/);
assert.ok(parserMatch, 'BulkImportPage parseCSV must be found in pages.jsx');

function clientParseCSV(csvText) {
  return vm.runInNewContext(
    `${parserMatch[0]}\nparseCSV(csvText);`,
    { csvText },
    { timeout: 1000 }
  );
}

// ----------------------------------------------------------------------
// Backend modules
// ----------------------------------------------------------------------
const adminService = require('../modules/admin/admin.service');
const adminController = require('../modules/admin/admin.controller');
const { schemas } = require('../middleware/validate.middleware');
const { protect, restrictTo } = require('../modules/auth/auth.middleware');
const { auditLog } = require('../middleware/audit.middleware');
const User = require('../modules/admin/admin.model');
const AuditLog = require('../models/AuditLog.model');

// ----------------------------------------------------------------------
// Test 1: Valid import creates users with the right role
// ----------------------------------------------------------------------
test('1. Valid import creates users with the right role', async () => {
  const csvText = 'name,email,phone,role\nAlice Test,alice@example.com,1234567890,T2_ASSOCIATE\n';
  const { rows, errs } = clientParseCSV(csvText);

  assert.equal(errs.length, 0, 'No client parse errors on valid CSV');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].role, 'T2_ASSOCIATE');

  const origFindOne = User.findOne;
  const origCreate = User.create;

  try {
    User.findOne = async () => null; // email not in use
    User.create = async (doc) => ({
      ...doc,
      _id: '507f1f77bcf86cd799439099',
      toObject: () => ({ ...doc, _id: '507f1f77bcf86cd799439099' }),
    });

    const result = await adminService.createUser({
      name: rows[0].name,
      email: rows[0].email,
      phone: rows[0].phone,
      role: rows[0].role,
    });

    assert.equal(result.user.name, 'Alice Test');
    assert.equal(result.user.email, 'alice@example.com');
    assert.equal(result.user.role, 'T2_ASSOCIATE');
    assert.equal(result.user.isActive, true);
  } finally {
    User.findOne = origFindOne;
    User.create = origCreate;
  }
});

// ----------------------------------------------------------------------
// Test 2: Non-admin (T1/T2/T3, no token, expired token) is rejected
// ----------------------------------------------------------------------
test('2. Non-admin (T1/T2/T3, no token, expired token) is rejected', async () => {
  const roles = ['T1_VOLUNTEER', 'T2_ASSOCIATE', 'T3_EXECUTIVE'];
  const middleware = restrictTo('ADMIN', 'SUPER_ADMIN');

  for (const role of roles) {
    let status = null;
    let body = null;
    const req = { user: { sub: '507f1f77bcf86cd799439011', role } };
    const res = {
      status: (s) => { status = s; return { json: (b) => { body = b; } }; },
    };
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });

    assert.equal(status, 403, `Role ${role} must be rejected with 403`);
    assert.equal(nextCalled, false);
    assert.match(body.message, /permission|denied/i);
  }

  // No token
  let noTokenStatus = null;
  const reqNoAuth = { headers: {} };
  const resNoAuth = {
    status: (s) => { noTokenStatus = s; return { json: () => {} }; },
  };
  await protect(reqNoAuth, resNoAuth, () => {});
  assert.equal(noTokenStatus, 401, 'Request without token must be rejected with 401');

  // Expired token
  const expiredToken = jwt.sign(
    { sub: '507f1f77bcf86cd799439011', role: 'ADMIN', sid: 'valid-session' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: -10 }
  );
  let expiredStatus = null;
  const reqExpired = { headers: { authorization: `Bearer ${expiredToken}` } };
  const resExpired = {
    status: (s) => { expiredStatus = s; return { json: () => {} }; },
  };
  await protect(reqExpired, resExpired, () => {});
  assert.equal(expiredStatus, 401, 'Request with expired token must be rejected with 401');
});

// ----------------------------------------------------------------------
// Test 3: Role escalation attempts (ADMIN, SUPER_ADMIN, mixed case, spaces, unknown) are rejected
// ----------------------------------------------------------------------
test('3. Role escalation attempts (ADMIN, SUPER_ADMIN, mixed case, spaces, unknown) are rejected', async () => {
  // Invalid string formats: Joi schema validation
  const invalidRoles = ['t1_volunteer', ' T1_VOLUNTEER ', 'MANAGER', 'GUEST', ''];
  for (const r of invalidRoles) {
    const { error } = schemas.addUser.validate({
      name: 'Escalation Test',
      email: 'esc@example.com',
      role: r,
    });
    assert.ok(error, `Role "${r}" must fail Joi validation`);
  }

  // Privilege escalation check: An ADMIN caller must NOT be permitted to create a SUPER_ADMIN.
  let allowed = true;
  let responseStatus = null;
  let responseBody = null;
  const req = {
    user: { sub: '507f1f77bcf86cd799439011', role: 'ADMIN' },
    body: { name: 'Super Escalation', email: 'superesc@example.com', role: 'SUPER_ADMIN' },
  };
  const res = {
    status: (s) => { responseStatus = s; return { json: (b) => { responseBody = b; } }; },
  };

  await adminController.addUser(req, res);
  if (responseStatus === 403) {
    allowed = false;
  }

  assert.equal(
    allowed,
    false,
    'SECURITY BUG: An ADMIN caller must NOT be allowed to create a SUPER_ADMIN'
  );
  assert.equal(responseStatus, 403);
  assert.match(responseBody.message, /Super Admin/i);
});

// ----------------------------------------------------------------------
// Test 4: Extra columns are ignored / rejected
// ----------------------------------------------------------------------
test('4. Extra columns are ignored / rejected', () => {
  // Backend validation: Joi must reject mass-assignment fields (tier, permissions, isActive, password)
  const payloadWithExtras = {
    name: 'Normal User',
    email: 'normal@example.com',
    role: 'T1_VOLUNTEER',
    tier: 'T3',
    permissions: ['ALL_PERMISSIONS'],
    isActive: false,
    password: 'injected_password',
  };

  const { error } = schemas.addUser.validate(payloadWithExtras);
  assert.ok(error, 'Backend Joi schema must reject unexpected extra properties');
  assert.match(error.message, /not allowed/);
});

// ----------------------------------------------------------------------
// Test 5: Duplicate emails (in file, and against existing users) are handled
// ----------------------------------------------------------------------
test('5. Duplicate emails (in file, and against existing users) are handled', async () => {
  // 5a. Against existing users in database: backend throws Error
  const origFindOne = User.findOne;
  try {
    User.findOne = async () => ({ email: 'existing@example.com' });
    await assert.rejects(
      () => adminService.createUser({
        name: 'Existing',
        email: 'existing@example.com',
        role: 'T1_VOLUNTEER',
      }),
      /Email already exists/
    );
  } finally {
    User.findOne = origFindOne;
  }

  // 5b. Inside the CSV file:
  // A robust CSV parser must detect duplicate emails within the file and flag them before sending.
  const duplicateCsv = [
    'name,email,phone,role',
    'User One,dup@example.com,123,T1_VOLUNTEER',
    'User Two,dup@example.com,456,T2_ASSOCIATE',
  ].join('\n');

  const { rows, errs } = clientParseCSV(duplicateCsv);

  // If the client parser does not detect intra-file duplicate emails, this test documents the bug
  const duplicateErrors = errs.filter(e => e.errors.some(msg => /duplicate/i.test(msg)));
  assert.ok(
    duplicateErrors.length > 0,
    'SECURITY/CORRECTNESS BUG: CSV parser fails to detect intra-file duplicate emails'
  );
});

// ----------------------------------------------------------------------
// Test 6: Bad email / bad phone rows are reported per row
// ----------------------------------------------------------------------
test('6. Bad email / bad phone rows are reported per row', () => {
  const badRowsCsv = [
    'name,email,phone,role',
    'Good User,good@example.com,1234567890,T1_VOLUNTEER',
    'Bad Email,not-an-email,1234567890,T1_VOLUNTEER',
    'Bad Phone,goodphone@example.com,INVALID_PHONE_###$$$,T1_VOLUNTEER',
  ].join('\n');

  const { rows, errs } = clientParseCSV(badRowsCsv);

  // Row 2 (line 3) has bad email
  const line3Err = errs.find(e => e.line === 3);
  assert.ok(line3Err, 'Line 3 must report an error for invalid email');
  assert.ok(line3Err.errors.includes('Invalid email'));

  // Row 3 (line 4) has bad phone: client parser should validate phone format
  const line4Err = errs.find(e => e.line === 4);
  assert.ok(
    line4Err && line4Err.errors.some(msg => /phone/i.test(msg)),
    'CORRECTNESS BUG: CSV parser does not validate phone format'
  );
});

// ----------------------------------------------------------------------
// Test 7: NoSQL injection payloads are not executed
// ----------------------------------------------------------------------
test('7. NoSQL injection payloads are not executed', () => {
  const injectionPayload = {
    name: 'Injection User',
    email: { $ne: null },
    role: 'T1_VOLUNTEER',
  };

  const { error } = schemas.addUser.validate(injectionPayload);
  assert.ok(error, 'NoSQL operator injection object in email must be rejected by Joi');
  assert.match(error.message, /must be a string/);
});

// ----------------------------------------------------------------------
// Test 8: Formula injection values are neutralized or rejected
// ----------------------------------------------------------------------
test('8. Formula injection values are rejected (not silently stored with apostrophe prefix)', () => {
  const formulaCsv = [
    'name,email,phone,role',
    '=cmd|\'/C calc\'!A0,formula1@example.com,123,T1_VOLUNTEER',
    '+1234567890,formula2@example.com,123,T1_VOLUNTEER',
    '@SUM(1+1),formula3@example.com,123,T1_VOLUNTEER',
    '-2+5,formula4@example.com,123,T1_VOLUNTEER',
  ].join('\n');

  const { rows, errs } = clientParseCSV(formulaCsv);

  // F: Formula-starting names must produce per-row errors and must NOT appear in valid rows
  // The parser must reject them (not silently prefix with apostrophe and store altered data)
  const formulaRows = rows.filter(r => {
    const firstChar = r.name ? r.name.charAt(0) : '';
    return ['=', '+', '-', '@'].includes(firstChar);
  });

  assert.equal(
    formulaRows.length,
    0,
    'SECURITY BUG: Formula-injection names must not appear unmodified in the rows array'
  );

  // Each formula row must appear in errs with a descriptive error message
  const formulaErrors = errs.filter(e => e.errors.some(msg => /formula injection/i.test(msg)));
  assert.ok(
    formulaErrors.length >= 4,
    `Expected at least 4 formula-injection errors, got ${formulaErrors.length}: ${JSON.stringify(errs)}`
  );
});

// ----------------------------------------------------------------------
// Test 9: Oversized file and too many rows are rejected
// ----------------------------------------------------------------------
test('9. Oversized file and too many rows are rejected', () => {
  // Generate a CSV with 501 rows (standard limit is 500 rows or 2MB)
  let bigCsv = 'name,email,phone,role\n';
  for (let i = 1; i <= 501; i++) {
    bigCsv += `User ${i},user${i}@example.com,1234567890,T1_VOLUNTEER\n`;
  }

  const { rows, errs } = clientParseCSV(bigCsv);

  // If the parser has a maximum row limit, it must report an error when exceeding 500 rows
  const hasRowLimitError = errs.some(e => e.errors && e.errors.some(msg => /too many rows|limit/i.test(msg))) || rows.length <= 500;

  assert.ok(
    hasRowLimitError,
    'CORRECTNESS/STABILITY BUG: CSV parser does not enforce a maximum row limit (e.g. 500 rows)'
  );
});

// ----------------------------------------------------------------------
// Test 10: Non-CSV file is rejected
// ----------------------------------------------------------------------
test('10. Non-CSV file is rejected', () => {
  // In BulkImportPage, accept=".csv,.txt,.xlsx,.xls".
  // Passing binary XLSX content or a non-CSV header should be rejected
  const nonCsvText = 'PK\x03\x04\x14\x00\x06\x00\x08\x00\x00\x00BinaryZipSpreadsheetHeaderData';
  const { rows, errs } = clientParseCSV(nonCsvText);

  const rejected = errs.length > 0 && rows.length === 0;
  assert.ok(
    rejected,
    'CORRECTNESS BUG: Non-CSV binary data is parsed without header validation error'
  );
});

// ----------------------------------------------------------------------
// Test 11: The response contains NO passwords
// ----------------------------------------------------------------------
test('11. The response contains NO passwords', async () => {
  let responseStatusCode = null;
  let responseBody = null;

  const req = {
    body: {
      name: 'Safe User',
      email: 'safe@example.com',
      phone: '1234567890',
      role: 'T1_VOLUNTEER',
    },
  };

  const res = {
    status: (s) => {
      responseStatusCode = s;
      return {
        json: (b) => { responseBody = b; },
      };
    },
  };

  const origCreateUser = adminService.createUser;
  try {
    adminService.createUser = async (data) => ({
      user: { _id: '507f1f77bcf86cd799439088', name: data.name, email: data.email, role: data.role },
      tempPassword: 'TBI@generated123',
    });

    await adminController.addUser(req, res);

    assert.equal(responseStatusCode, 201);
    // Credentials should be delivered via email only, never returned in HTTP response JSON
    assert.equal(
      responseBody.tempPassword,
      undefined,
      'SECURITY LEAK: adminController.addUser exposes tempPassword in API response'
    );
  } finally {
    adminService.createUser = origCreateUser;
  }
});

// ----------------------------------------------------------------------
// Test 12: mustChangePassword is set on new users
// ----------------------------------------------------------------------
test('12. mustChangePassword is set on new users', async () => {
  let createdDoc = null;
  const origFindOne = User.findOne;
  const origCreate = User.create;

  try {
    User.findOne = async () => null;
    User.create = async (doc) => {
      createdDoc = doc;
      return {
        ...doc,
        _id: '507f1f77bcf86cd799439077',
        toObject: () => ({ ...doc, _id: '507f1f77bcf86cd799439077' }),
      };
    };

    await adminService.createUser({
      name: 'Must Change',
      email: 'mustchange@example.com',
      phone: '1234567890',
      role: 'T1_VOLUNTEER',
    });

    assert.ok(createdDoc, 'User record must be created');
    assert.equal(createdDoc.mustChangePassword, true, 'mustChangePassword must be true for new users');
  } finally {
    User.findOne = origFindOne;
    User.create = origCreate;
  }
});

// ----------------------------------------------------------------------
// Test 13: An audit log entry is written
// ----------------------------------------------------------------------
test('13. An audit log entry is written', async () => {
  let auditEntryCreated = null;
  const origCreate = AuditLog.create;

  try {
    AuditLog.create = async (entry) => {
      auditEntryCreated = entry;
      return entry;
    };

    const req = {
      user: { sub: '507f1f77bcf86cd799439001', name: 'Admin Performer' },
      body: { name: 'Audit User', email: 'audit@example.com', role: 'T1_VOLUNTEER' },
      params: {},
      ip: '127.0.0.1',
    };

    const listeners = {};
    const res = {
      statusCode: 201,
      on: (event, cb) => { listeners[event] = cb; },
    };

    const middleware = auditLog('USER_CREATED');
    let nextCalled = false;
    middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.ok(listeners['finish'], 'res.on("finish") listener must be registered');

    // Trigger finish
    await listeners['finish']();

    assert.ok(auditEntryCreated, 'AuditLog entry must be created');
    assert.equal(auditEntryCreated.action, 'USER_CREATED');
    assert.equal(auditEntryCreated.performedBy, '507f1f77bcf86cd799439001');
    assert.equal(auditEntryCreated.targetType, 'User');
  } finally {
    AuditLog.create = origCreate;
  }
});
