const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// Strict HR-style safety guards: Only run when explicitly enabled on local test DB
const shouldRun =
  process.env.RUN_CONCURRENT_INTEGRATION_TEST === 'true' &&
  process.env.MONGODB_URI &&
  process.env.MONGODB_URI.includes('localhost') &&
  process.env.MONGODB_URI.endsWith('_test');

test('50-Concurrent-Scan Integration Test (Real MongoDB)', { skip: !shouldRun }, async (t) => {
  await mongoose.connect(process.env.MONGODB_URI);
  const AttendanceLink = require('../modules/attendance/attendanceLink.model');
  const Attendance = require('../modules/attendance/attendance.model');
  const linkService = require('../modules/attendance/attendanceLink.service');
  const { generateStepCode } = require('../modules/attendance/rollingCode.util');

  // Clean test collection
  await Attendance.deleteMany({});
  await AttendanceLink.deleteMany({});

  const t3Lead = {
    sub: new mongoose.Types.ObjectId().toString(),
    name: 'Lead Organizer',
    role: 'T3_EXECUTIVE',
  };

  // Create geofenced rolling link (Bangalore: 12.971598, 77.594566, radius 100m)
  const session = await linkService.generateLink({
    minutes: 30,
    sessionLabel: 'Concurrent Load Test Session',
    geo: { enabled: true, lat: 12.971598, lng: 77.594566, radiusM: 100, maxAccuracyM: 50 },
    rolling: { enabled: true, stepSeconds: 30 },
  }, t3Lead);

  const linkDoc = await AttendanceLink.findOne({ token: session.token }).select('+secret');
  const activeCode = generateStepCode(linkDoc.secret, linkDoc.token, 30);

  // 1. Concurrency Test: 50 distinct users scan simultaneously
  await t.test('50 simultaneous unique student scans produce exactly 50 records with 0 lost writes', async () => {
    const users = Array.from({ length: 50 }, (_, i) => ({
      sub: new mongoose.Types.ObjectId().toString(),
      name: `Student_${i + 1}`,
      email: `student_${i + 1}@example.com`,
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
    assert.equal(successful.length, 50, 'All 50 concurrent scans must succeed');

    const totalInDb = await Attendance.countDocuments({ linkId: linkDoc._id });
    assert.equal(totalInDb, 50, 'Exactly 50 attendance records must exist in MongoDB');
  });

  // 2. Race Condition Test: Same user fires 10 simultaneous requests
  await t.test('10 simultaneous submissions from the same user results in exactly 1 pass and 9 conflicts', async () => {
    const testUser = {
      sub: new mongoose.Types.ObjectId().toString(),
      name: 'Racer Student',
      email: 'racer@example.com',
      role: 'T3_EXECUTIVE',
    };

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

  await mongoose.disconnect();
});
