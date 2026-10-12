const mongoose = require('mongoose');
const Attendance = require('../src/modules/attendance/attendance.model');
const AttendanceLink = require('../src/modules/attendance/attendanceLink.model');
const User = require('../src/modules/admin/admin.model');
const linkService = require('../src/modules/attendance/attendanceLink.service');

const runTests = async () => {
  console.log('--- Testing Time-Limited Attendance Link + QR Feature ---');

  // Helper date function matching service
  const getTodayKolkata = () => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  };

  const today = getTodayKolkata();
  console.log(`Current Asia/Kolkata Today: ${today}`);

  // Mock Users
  const t3User = {
    _id: new mongoose.Types.ObjectId(),
    sub: new mongoose.Types.ObjectId().toString(),
    name: 'T3 Tester',
    email: 't3@example.com',
    role: 'T3_EXECUTIVE',
  };

  const otherTeamUser = {
    _id: new mongoose.Types.ObjectId(),
    sub: new mongoose.Types.ObjectId().toString(),
    name: 'T1 Volunteer Tester',
    email: 't1@example.com',
    role: 'T1_VOLUNTEER',
  };

  // Test 1: Link & QR Generation
  console.log('\n[Test 1] Generating Link & QR (15 minutes)...');
  const genResult = await linkService.generateLink({ minutes: 15 }, t3User);
  console.log('✓ Link URL:', genResult.url);
  console.log('✓ QR Code generated (base64 length):', genResult.qrCode.length);
  console.log('✓ Token:', genResult.token);
  console.log('✓ StartsAt:', genResult.startsAt);
  console.log('✓ ExpiresAt:', genResult.expiresAt);
  console.log('✓ Active:', genResult.active);

  if (!genResult.token || !genResult.qrCode.startsWith('data:image/png;base64,')) {
    throw new Error('Test 1 Failed: Invalid token or QR');
  }

  // Test 2: Info endpoint (read-only verification, doesn't mark attendance)
  console.log('\n[Test 2] Reading link info without marking...');
  const infoResult = await linkService.getLinkInfo(genResult.token, t3User);
  console.log('✓ Info status:', infoResult.status);
  console.log('✓ Already marked:', infoResult.alreadyMarked);

  // Test 3: Wrong team check (403)
  console.log('\n[Test 3] Wrong team marking attendance (expect 403)...');
  try {
    await linkService.markAttendance(genResult.token, otherTeamUser);
    throw new Error('Test 3 Failed: Wrong team was allowed to mark attendance');
  } catch (err) {
    console.log(`✓ Correctly rejected with status ${err.statusCode}: "${err.message}"`);
    if (err.statusCode !== 403) throw new Error(`Expected 403, got ${err.statusCode}`);
  }

  // Test 4: Marking attendance (POST)
  console.log('\n[Test 4] T3 user marking attendance...');
  const markResult = await linkService.markAttendance(genResult.token, t3User);
  console.log('✓ Attendance marked id:', markResult._id);
  console.log('✓ Attendance user:', markResult.user);
  console.log('✓ Attendance date:', markResult.date);
  console.log('✓ Attendance status:', markResult.status);

  // Test 5: Duplicate mark on the same day (expect 409)
  console.log('\n[Test 5] Duplicate mark by same user on same day (expect 409)...');
  try {
    await linkService.markAttendance(genResult.token, t3User);
    throw new Error('Test 5 Failed: Duplicate mark was allowed');
  } catch (err) {
    console.log(`✓ Correctly rejected with status ${err.statusCode}: "${err.message}"`);
    if (err.statusCode !== 409) throw new Error(`Expected 409, got ${err.statusCode}`);
  }

  // Test 6: Link not started yet (expect 425)
  console.log('\n[Test 6] Link not started yet (future window, expect 425)...');
  const futureLink = await AttendanceLink.create({
    token: 'future_test_token_' + Date.now(),
    team: 'T3',
    createdBy: t3User.sub,
    startsAt: new Date(Date.now() + 600000), // starts in 10 mins
    expiresAt: new Date(Date.now() + 1200000),
    date: today,
    active: true,
  });

  const freshUser = {
    _id: new mongoose.Types.ObjectId(),
    sub: new mongoose.Types.ObjectId().toString(),
    name: 'Fresh T3 Member',
    email: 'fresh@example.com',
    role: 'T3_EXECUTIVE',
  };

  try {
    await linkService.markAttendance(futureLink.token, freshUser);
    throw new Error('Test 6 Failed: Not started link was allowed');
  } catch (err) {
    console.log(`✓ Correctly rejected with status ${err.statusCode}: "${err.message}"`);
    if (err.statusCode !== 425) throw new Error(`Expected 425, got ${err.statusCode}`);
  }

  // Test 7: Expired link (expect 410)
  console.log('\n[Test 7] Expired link (past window, expect 410)...');
  const expiredLink = await AttendanceLink.create({
    token: 'expired_test_token_' + Date.now(),
    team: 'T3',
    createdBy: t3User.sub,
    startsAt: new Date(Date.now() - 600000),
    expiresAt: new Date(Date.now() - 1000), // expired 1s ago
    date: today,
    active: true,
  });

  try {
    await linkService.markAttendance(expiredLink.token, freshUser);
    throw new Error('Test 7 Failed: Expired link was allowed');
  } catch (err) {
    console.log(`✓ Correctly rejected with status ${err.statusCode}: "${err.message}"`);
    if (err.statusCode !== 410) throw new Error(`Expected 410, got ${err.statusCode}`);
  }

  // Test 8: Deactivated link early (expect 410)
  console.log('\n[Test 8] Deactivating link early and marking (expect 410)...');
  await linkService.deactivateLink(genResult.token, t3User);
  try {
    await linkService.markAttendance(genResult.token, freshUser);
    throw new Error('Test 8 Failed: Deactivated link was allowed');
  } catch (err) {
    console.log(`✓ Correctly rejected with status ${err.statusCode}: "${err.message}"`);
    if (err.statusCode !== 410) throw new Error(`Expected 410, got ${err.statusCode}`);
  }

  // Test 9: Invalid link token (expect 404)
  console.log('\n[Test 9] Invalid token (expect 404)...');
  try {
    await linkService.markAttendance('non_existent_token_123', freshUser);
    throw new Error('Test 9 Failed: Non-existent link was allowed');
  } catch (err) {
    console.log(`✓ Correctly rejected with status ${err.statusCode}: "${err.message}"`);
    if (err.statusCode !== 404) throw new Error(`Expected 404, got ${err.statusCode}`);
  }

  // Test 10: T3 Attendance Panel Endpoint
  console.log('\n[Test 10] T3 Attendance Panel Endpoint...');
  const panel = await linkService.getT3TodayPanel();
  console.log('✓ Panel Date:', panel.date);
  console.log('✓ Panel TimeZone:', panel.timeZone);
  console.log('✓ Total T3 Users:', panel.totalCount);
  console.log('✓ Present Count:', panel.presentCount);
  console.log('✓ Absent Count:', panel.absentCount);
  console.log('✓ Sample present members:', panel.presentMembers.slice(0, 2));

  // Clean up test documents
  await Attendance.deleteMany({ _id: markResult._id });
  await AttendanceLink.deleteMany({ token: { $in: [genResult.token, futureLink.token, expiredLink.token] } });

  console.log('\n=== ALL 10 TESTS PASSED SUCCESSFULLY! ===');
};

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI environment variable is required.');
  process.exit(1);
}

mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
  .then(async () => {
    try {
      await runTests();
    } finally {
      await mongoose.disconnect();
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('Test execution error:', err);
    process.exit(1);
  });
