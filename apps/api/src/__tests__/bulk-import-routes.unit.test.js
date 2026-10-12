const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
process.env.REDIS_CACHE_URL = 'redis://localhost:6379/0';
process.env.REDIS_PUBSUB_URL = 'redis://localhost:6379/1';
process.env.REDIS_QUEUE_URL = 'redis://localhost:6379/2';

// Intercept nodemailer
nodemailer.createTransport = () => ({
  sendMail: async () => ({ messageId: 'mock-mail-id' }),
});
nodemailer.createTestAccount = async () => ({
  user: 'mock@ethereal.test',
  pass: 'mockpass',
});

const adminController = require('../modules/admin/admin.controller');
const { schemas } = require('../middleware/validate.middleware');
const attendanceService = require('../modules/attendance/attendance.service');
const timesheetsService = require('../modules/timesheets/timesheets.service');
const User = require('../modules/admin/admin.model');
const Attendance = require('../modules/attendance/attendance.model');
const Timesheet = require('../modules/timesheets/timesheets.model');
const Team = require('../modules/teams/teams.model');

// Helper to mock express res object
function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

// ----------------------------------------------------------------------
// Test 1: SUPER_ADMIN creation rejected when called with ADMIN token
// ----------------------------------------------------------------------
test('Route Security: SUPER_ADMIN creation rejected for non-SUPER_ADMIN callers', async () => {
  // 1a. Single user route
  const reqSingle = {
    user: { sub: '507f1f77bcf86cd799439001', role: 'ADMIN' },
    body: {
      name: 'Sneaky Admin',
      email: 'sneaky@example.com',
      role: 'SUPER_ADMIN',
    },
  };
  const resSingle = createMockRes();
  await adminController.addUser(reqSingle, resSingle);

  assert.equal(resSingle.statusCode, 403, 'addUser must return 403 when ADMIN tries to create SUPER_ADMIN');
  assert.match(resSingle.body.message, /Only Super Admins can create Super Admin or Admin accounts/);

  // 1b. Bulk user route
  const reqBulk = {
    user: { sub: '507f1f77bcf86cd799439001', role: 'ADMIN' },
    body: {
      rows: [
        { name: 'Volunteer', email: 'v1@example.com', role: 'T1_VOLUNTEER' },
        { name: 'Sneaky Super', email: 'sneaky-super@example.com', role: 'SUPER_ADMIN' },
      ],
    },
  };
  const resBulk = createMockRes();
  await adminController.bulkImportUsers(reqBulk, resBulk);

  assert.equal(resBulk.statusCode, 403, 'bulkImportUsers must return 403 when ADMIN tries to create SUPER_ADMIN');
  assert.match(resBulk.body.message, /Only Super Admins can create Super Admin or Admin accounts/);
});

// ----------------------------------------------------------------------
// Test 2: Server-side phone and length validations
// ----------------------------------------------------------------------
test('Server-Side Validation: phone, name, email length constraints', () => {
  // Bad phone characters rejected
  const badPhone = schemas.addUser.validate({
    name: 'Valid Name',
    email: 'valid@example.com',
    phone: 'INVALID_PHONE_#$%',
  });
  assert.ok(badPhone.error, 'Phone with invalid symbols must be rejected');

  // Phone exceeding 20 chars rejected
  const longPhone = schemas.addUser.validate({
    name: 'Valid Name',
    email: 'valid@example.com',
    phone: '123456789012345678901',
  });
  assert.ok(longPhone.error, 'Phone over 20 chars must be rejected');

  // Empty string phone allowed (optional)
  const emptyPhone = schemas.addUser.validate({
    name: 'Valid Name',
    email: 'valid@example.com',
    phone: '',
  });
  assert.equal(emptyPhone.error, undefined, 'Empty string phone must stay allowed');

  // Valid international phone allowed
  const validIntlPhone = schemas.addUser.validate({
    name: 'Valid Name',
    email: 'valid@example.com',
    phone: '+1 (555) 123-4567',
  });
  assert.equal(validIntlPhone.error, undefined, 'Valid international formatted phone must be accepted');

  // Bulk schema validates rows similarly
  const badBulkPhone = schemas.bulkUsers.validate({
    rows: [{ name: 'Valid Name', email: 'valid@example.com', phone: 'BAD_PHONE!' }],
  });
  assert.ok(badBulkPhone.error, 'Bulk import schema must reject invalid phone');

  // Email length max 254 chars
  const longEmail = schemas.addUser.validate({
    name: 'Valid Name',
    email: 'a'.repeat(240) + '@example.com',
  });
  assert.ok(longEmail.error, 'Email over 254 chars must be rejected');

  // Name length max 100 chars
  const longName = schemas.addUser.validate({
    name: 'a'.repeat(101),
    email: 'valid@example.com',
  });
  assert.ok(longName.error, 'Name over 100 chars must be rejected');
});

// ----------------------------------------------------------------------
// Test 3: Over-limit rows rejected (max 500 rows)
// ----------------------------------------------------------------------
test('Server-Side Validation: over-limit rows rejected in bulk endpoint', () => {
  const rows501 = [];
  for (let i = 1; i <= 501; i++) {
    rows501.push({
      name: `User ${i}`,
      email: `user${i}@example.com`,
      role: 'T1_VOLUNTEER',
    });
  }

  const { error } = schemas.bulkUsers.validate({ rows: rows501 });
  assert.ok(error, 'Passing 501 rows must be rejected by bulkUsers validation schema');
  assert.match(error.message, /must contain less than or equal to 500 items/);
});

// ----------------------------------------------------------------------
// Test 4: No password or tempPassword in any API response
// ----------------------------------------------------------------------
test('Security: No password or tempPassword in any response', async () => {
  const origFindOne = User.findOne;
  const origCreate = User.create;

  try {
    User.findOne = async () => null;
    User.create = async (doc) => ({
      ...doc,
      _id: '507f1f77bcf86cd799439055',
      toObject: () => ({ ...doc, _id: '507f1f77bcf86cd799439055' }),
    });

    // 4a. Check addUser response
    const reqSingle = {
      user: { sub: '507f1f77bcf86cd799439001', role: 'ADMIN' },
      body: { name: 'Alice Single', email: 'alice-single@example.com', role: 'T1_VOLUNTEER' },
    };
    const resSingle = createMockRes();
    await adminController.addUser(reqSingle, resSingle);

    assert.equal(resSingle.statusCode, 201);
    assert.equal(resSingle.body.tempPassword, undefined, 'addUser must not expose tempPassword');
    assert.equal(resSingle.body.data.password, undefined, 'addUser must not expose password');

    // 4b. Check bulkImportUsers response
    const reqBulk = {
      user: { sub: '507f1f77bcf86cd799439001', role: 'ADMIN' },
      body: {
        rows: [{ name: 'Bob Bulk', email: 'bob-bulk@example.com', role: 'T2_ASSOCIATE' }],
      },
    };
    const resBulk = createMockRes();
    await adminController.bulkImportUsers(reqBulk, resBulk);

    assert.equal(resBulk.statusCode, 200);
    const jsonStr = JSON.stringify(resBulk.body);
    assert.doesNotMatch(jsonStr, /"tempPassword"/, 'bulk response must never include tempPassword');
    assert.doesNotMatch(jsonStr, /"password"/, 'bulk response must never include password');
    assert.equal(resBulk.body.results[0].status, 'created');
  } finally {
    User.findOne = origFindOne;
    User.create = origCreate;
  }
});

// ----------------------------------------------------------------------
// Test 5: Formula values escaped in CSV exports
// ----------------------------------------------------------------------
test('Security: Formula values (=, +, -, @, tab) are escaped in exports', async () => {
  // 5a. Attendance export
  const origTeamFindById = Team.findById;
  const origAttendanceFind = Attendance.find;

  try {
    Team.findById = async () => ({
      _id: '507f1f77bcf86cd799439099',
      name: 'Engineering Team',
      leadId: '507f1f77bcf86cd799439001',
      populate: async () => {},
    });

    Attendance.find = () => ({
      sort: async () => [
        {
          date: '2026-10-01',
          studentName: '=cmd|\'/C calc\'!A0',
          studentEmail: 'formula@example.com',
          teamName: '@SuperTeam',
          status: 'Present',
          checkInTime: new Date('2026-10-01T09:00:00Z'),
          checkOutTime: new Date('2026-10-01T17:00:00Z'),
          durationMinutes: 480,
          method: 'QR',
          markedByName: '+Lead Admin',
          notes: '-Formula note with "quotes"',
        },
      ],
    });

    const exportResult = await attendanceService.getAttendanceSheet(
      '507f1f77bcf86cd799439099',
      '2026-10-01',
      '2026-10-02',
      { sub: '507f1f77bcf86cd799439001', role: 'ADMIN' }
    );

    const csv = exportResult.csv;
    // Formula characters must be prepended with ' and wrapped in double-quotes
    assert.match(csv, /"'=cmd\|'\/C calc'!A0"/, 'Formula = in studentName must be escaped with apostrophe');
    assert.match(csv, /"'@SuperTeam"/, 'Formula @ in teamName must be escaped with apostrophe');
    assert.match(csv, /"'\+Lead Admin"/, 'Formula + in markedByName must be escaped with apostrophe');
    assert.match(csv, /"'-Formula note with ""quotes"""/, 'Formula - and quotes in notes must be escaped');
  } finally {
    Team.findById = origTeamFindById;
    Attendance.find = origAttendanceFind;
  }

  // 5b. Timesheets export
  const origTimesheetFind = Timesheet.find;
  try {
    Team.findById = async () => ({
      _id: '507f1f77bcf86cd799439099',
      name: 'Engineering Team',
      leadId: '507f1f77bcf86cd799439001',
    });

    Timesheet.find = () => ({
      sort: async () => [
        {
          date: '2026-10-01',
          userName: '=ExploitName',
          userEmail: 'worker@example.com',
          userRole: 'T1_VOLUNTEER',
          startTime: '09:00',
          endTime: '17:00',
          breakMinutes: 30,
          totalHours: 7.5,
          taskDescription: '@SUM(B1:B10)',
          status: 'approved',
        },
      ],
    });

    const timesheetExport = await timesheetsService.exportTeamCSV(
      '507f1f77bcf86cd799439099',
      '2026-10-01',
      '2026-10-02',
      { sub: '507f1f77bcf86cd799439001', role: 'ADMIN' }
    );

    const tsCsv = timesheetExport.csv;
    assert.match(tsCsv, /"'=ExploitName"/, 'Formula = in userName must be escaped with apostrophe');
    assert.match(tsCsv, /"'@SUM\(B1:B10\)"/, 'Formula @ in taskDescription must be escaped with apostrophe');
  } finally {
    Team.findById = origTeamFindById;
    Timesheet.find = origTimesheetFind;
  }
});
