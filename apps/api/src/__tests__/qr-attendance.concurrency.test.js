/**
 * Concurrency & Real MongoDB Integration Test for QR Geofencing & Rolling Codes.
 *
 * To run with real local MongoDB:
 *   docker run -d -p 27017:27017 --name cmt-mongo mongo:5.0
 *   $env:QR_TEST_MONGODB_URI="mongodb://127.0.0.1:27017/qr_concurrency_test"
 *   node --test apps/api/src/__tests__/qr-attendance.concurrency.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const AttendanceLink = require('../modules/attendance/attendanceLink.model');
const Attendance = require('../modules/attendance/attendance.model');
const User = require('../modules/admin/admin.model');
const linkService = require('../modules/attendance/attendanceLink.service');
const { generateStepCode } = require('../modules/attendance/rollingCode.util');

// ============================================================================
// PART A: 50-CONCURRENT SCAN & RACE-CONDITION TEST (In-Process Mock Engine)
// ============================================================================
test('50-Concurrent-Scan & Race Condition Suite', { concurrency: 1 }, async (t) => {
  const origMethods = {
    AttendanceLink_create: AttendanceLink.create,
    AttendanceLink_findOne: AttendanceLink.findOne,
    AttendanceLink_find: AttendanceLink.find,
    Attendance_findOne: Attendance.findOne,
    Attendance_find: Attendance.find,
    Attendance_save: Attendance.prototype.save,
    User_find: User.find,
  };

  const store = {
    links: new Map(),
    attendances: new Map(),
    users: new Map(),
  };

  // Mock setup with atomic map insertion for race condition testing
  AttendanceLink.create = async (doc) => {
    const id = new mongoose.Types.ObjectId().toString();
    const item = {
      _id: id,
      ...doc,
      save: async function () {
        store.links.set(this.token, this);
        return this;
      },
    };
    store.links.set(doc.token, item);
    return item;
  };

  AttendanceLink.findOne = (query) => {
    let result = null;
    if (query.token) {
      result = store.links.get(query.token) || null;
    }
    return {
      select: () => ({
        populate: () => Promise.resolve(result),
        then: (resolve) => resolve(result),
      }),
      populate: () => Promise.resolve(result),
      then: (resolve) => resolve(result),
    };
  };

  AttendanceLink.find = () => {
    const all = Array.from(store.links.values());
    return {
      sort: () => Promise.resolve(all),
      then: (resolve) => resolve(all),
    };
  };

  Attendance.findOne = async (query) => {
    for (const att of store.attendances.values()) {
      let match = true;
      if (query.user && String(att.user) !== String(query.user)) match = false;
      if (query.linkId && String(att.linkId) !== String(query.linkId)) match = false;
      if (query.date && att.date !== query.date) match = false;
      if (match) return att;
    }
    return null;
  };

  Attendance.find = () => {
    const all = Array.from(store.attendances.values());
    return {
      populate: () => ({
        sort: () => Promise.resolve(all),
      }),
      sort: () => Promise.resolve(all),
    };
  };

  Attendance.prototype.save = async function () {
    // Atomically check duplicate constraint: { user: 1, linkId: 1 }
    for (const att of store.attendances.values()) {
      if (String(att.user) === String(this.user) && String(att.linkId) === String(this.linkId)) {
        const err = new Error('E11000 duplicate key error collection: attendances index: user_1_linkId_1');
        err.code = 11000;
        throw err;
      }
    }
    const id = this._id || new mongoose.Types.ObjectId().toString();
    this._id = id;
    store.attendances.set(id, this);
    return this;
  };

  User.find = () => ({
    select: () => Promise.resolve(Array.from(store.users.values())),
  });

  const t3Lead = {
    sub: new mongoose.Types.ObjectId().toString(),
    name: 'Lead Organizer',
    role: 'T3_EXECUTIVE',
  };
  store.users.set(t3Lead.sub, t3Lead);

  // Generate geofenced rolling link (100m default radius)
  const session = await linkService.generateLink({
    minutes: 30,
    sessionLabel: 'Concurrent Load Test Session',
    geo: { enabled: true, lat: 12.971598, lng: 77.594566, radiusM: 100, maxAccuracyM: 50 },
    rolling: { enabled: true, stepSeconds: 30 },
  }, t3Lead);

  const linkDoc = store.links.get(session.token);
  const activeCode = generateStepCode(linkDoc.secret, linkDoc.token, 30);

  // 1. 50 simultaneous unique student scans
  await t.test('50 simultaneous unique student scans produce exactly 50 records with 0 lost writes', async () => {
    const users = Array.from({ length: 50 }, (_, i) => {
      const u = {
        sub: new mongoose.Types.ObjectId().toString(),
        name: `Student_${i + 1}`,
        email: `student_${i + 1}@example.com`,
        role: 'T3_EXECUTIVE',
      };
      store.users.set(u.sub, u);
      return u;
    });

    const results = await Promise.allSettled(
      users.map((u) =>
        linkService.markAttendance(session.token, u, {
          code: activeCode,
          lat: 12.971610, // ~10m from venue
          lng: 77.594570,
          accuracy: 15,
        })
      )
    );

    const successful = results.filter((r) => r.status === 'fulfilled');
    assert.equal(successful.length, 50, 'All 50 concurrent scans must succeed');
    assert.equal(store.attendances.size, 50, 'Exactly 50 attendance records must exist in store');

    // Verify panel reflects all 50 attendees
    const panel = await linkService.getT3TodayPanel();
    assert.equal(panel.presentCount, 50, 'Panel must report 50 present members');
  });

  // 2. Race condition: 10 simultaneous requests from the same user on the same link
  await t.test('10 simultaneous submissions from the same user results in exactly 1 pass and 9 conflicts (409)', async () => {
    const testUser = {
      sub: new mongoose.Types.ObjectId().toString(),
      name: 'Racer Student',
      email: 'racer@example.com',
      role: 'T3_EXECUTIVE',
    };
    store.users.set(testUser.sub, testUser);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        linkService.markAttendance(session.token, testUser, {
          code: activeCode,
          lat: 12.971610,
          lng: 77.594570,
          accuracy: 15,
        })
      )
    );

    const passed = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r) => r.status === 'rejected' && r.reason?.statusCode === 409
    );

    assert.equal(passed.length, 1, 'Exactly 1 request must succeed');
    assert.equal(rejected.length, 9, 'All other 9 duplicate requests must be rejected with 409 Conflict');
  });

  t.after(() => {
    AttendanceLink.create = origMethods.AttendanceLink_create;
    AttendanceLink.findOne = origMethods.AttendanceLink_findOne;
    AttendanceLink.find = origMethods.AttendanceLink_find;
    Attendance.findOne = origMethods.Attendance_findOne;
    Attendance.find = origMethods.Attendance_find;
    Attendance.prototype.save = origMethods.Attendance_save;
    User.find = origMethods.User_find;
  });
});

// ============================================================================
// PART B: REAL MONGODB INTEGRATION TEST (Guarded by QR_TEST_MONGODB_URI)
// ============================================================================
const rawUri = process.env.QR_TEST_MONGODB_URI || process.env.HR_TEST_MONGODB_URI;

if (!rawUri) {
  test('Real MongoDB Integration (SKIPPED: QR_TEST_MONGODB_URI not set)', (t) => {
    t.skip('To run: $env:QR_TEST_MONGODB_URI="mongodb://127.0.0.1:27017/qr_concurrency_test"');
  });
} else {
  let parsedUrl;
  try {
    parsedUrl = new URL(rawUri);
  } catch (err) {
    console.error('REFUSAL: QR_TEST_MONGODB_URI is not a valid URL:', rawUri);
    process.exit(1);
  }

  const hostname = parsedUrl.hostname;
  const dbName = parsedUrl.pathname.replace(/^\//, '');

  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    console.error(`REFUSAL: QR_TEST_MONGODB_URI host must be 127.0.0.1 or localhost, got: ${hostname}`);
    process.exit(1);
  }

  if (!dbName.endsWith('_test')) {
    console.error(`REFUSAL: QR_TEST_MONGODB_URI database name must end with "_test", got: "${dbName}"`);
    process.exit(1);
  }

  test('Real MongoDB 50-Concurrent Integration Run', { concurrency: 1 }, async (t) => {
    await mongoose.connect(rawUri);

    await Attendance.deleteMany({});
    await AttendanceLink.deleteMany({});

    const t3Lead = {
      sub: new mongoose.Types.ObjectId().toString(),
      name: 'Lead Real Organizer',
      role: 'T3_EXECUTIVE',
    };

    const session = await linkService.generateLink({
      minutes: 30,
      sessionLabel: 'Real Mongo Concurrent Test',
      geo: { enabled: true, lat: 12.971598, lng: 77.594566, radiusM: 100, maxAccuracyM: 50 },
      rolling: { enabled: true, stepSeconds: 30 },
    }, t3Lead);

    const linkDoc = await AttendanceLink.findOne({ token: session.token }).select('+secret');
    const activeCode = generateStepCode(linkDoc.secret, linkDoc.token, 30);

    const users = Array.from({ length: 50 }, (_, i) => ({
      sub: new mongoose.Types.ObjectId().toString(),
      name: `Real_Student_${i + 1}`,
      email: `real_student_${i + 1}@example.com`,
      role: 'T3_EXECUTIVE',
    }));

    const results = await Promise.allSettled(
      users.map((u) =>
        linkService.markAttendance(session.token, u, {
          code: activeCode,
          lat: 12.971610,
          lng: 77.594570,
          accuracy: 15,
        })
      )
    );

    const successful = results.filter((r) => r.status === 'fulfilled');
    assert.equal(successful.length, 50, 'All 50 real concurrent scans must succeed');

    const totalInDb = await Attendance.countDocuments({ linkId: linkDoc._id });
    assert.equal(totalInDb, 50, 'Exactly 50 attendance records must exist in real MongoDB');

    await mongoose.disconnect();
  });
}
