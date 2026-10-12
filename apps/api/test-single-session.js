require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('./src/modules/admin/admin.model');
const authService = require('./src/modules/auth/auth.service');
const { authenticateToken } = require('./src/modules/auth/auth.middleware');
const tokens = require('./src/modules/auth/auth.tokens');

async function runTests() {
  console.log('--- STARTING SINGLE ACTIVE SESSION TESTS ---');
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI not found');
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('MongoDB connected for testing.');

  const testEmail = `test_session_${Date.now()}@example.com`;
  const rawPassword = 'Password123!@#';
  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  // Create test user
  const user = await User.create({
    name: 'Session Test User',
    email: testEmail,
    password: hashedPassword,
    role: 'T1_VOLUNTEER',
    mustChangePassword: false,
    isActive: true,
    activeSessionId: null,
    lastActivity: null,
  });
  console.log('Created test user:', user.email);

  try {
    // -------------------------------------------------------------
    // Test 1: Normal Login (Expect 200, sessionId set)
    // -------------------------------------------------------------
    console.log('\n[Test 1] Normal Login...');
    const loginResult1 = await authService.login(testEmail, rawPassword);
    if (!loginResult1.accessToken) throw new Error('Test 1 Failed: No accessToken returned');
    
    const dbUser1 = await User.findById(user._id);
    if (!dbUser1.activeSessionId) throw new Error('Test 1 Failed: activeSessionId not set in DB');
    if (!dbUser1.lastActivity) throw new Error('Test 1 Failed: lastActivity not set in DB');

    const decoded1 = tokens.verify(loginResult1.accessToken, 'access');
    if (!decoded1.sid || decoded1.sid !== dbUser1.activeSessionId) {
      throw new Error('Test 1 Failed: sid not embedded in JWT accessToken');
    }
    console.log('✓ Test 1 Passed: Normal login succeeded with activeSessionId:', dbUser1.activeSessionId);

    // -------------------------------------------------------------
    // Test 2: Second login while active (Expect 409 conflict)
    // -------------------------------------------------------------
    console.log('\n[Test 2] Second login attempt while session is active...');
    let caught409 = false;
    try {
      await authService.login(testEmail, rawPassword);
    } catch (err) {
      if (err.statusCode === 409 && err.message === 'This account is already logged in on another device') {
        caught409 = true;
      } else {
        console.error('Unexpected error:', err);
      }
    }
    if (!caught409) {
      throw new Error('Test 2 Failed: Expected 409 Conflict with message "This account is already logged in on another device"');
    }
    console.log('✓ Test 2 Passed: Second login was rejected with HTTP 409');

    // -------------------------------------------------------------
    // Test 3: Request with old session / mismatch sessionId (Expect 401)
    // -------------------------------------------------------------
    console.log('\n[Test 3] Request with an old/mismatched session token...');
    const fakeToken = tokens.sign(dbUser1, 'access', '15m', { role: dbUser1.role, sid: 'old_or_invalid_session_id' });
    let caught401SessionEnded = false;
    try {
      await authenticateToken(fakeToken);
    } catch (err) {
      if (err.message === 'Session ended. Please log in again.') {
        caught401SessionEnded = true;
      } else {
        console.error('Unexpected error in Test 3:', err);
      }
    }
    if (!caught401SessionEnded) {
      throw new Error('Test 3 Failed: Expected 401 "Session ended. Please log in again."');
    }
    console.log('✓ Test 3 Passed: Old session rejected with "Session ended. Please log in again."');

    // -------------------------------------------------------------
    // Test 4: Auth middleware keeps session alive on valid request
    // -------------------------------------------------------------
    console.log('\n[Test 4] Valid protected request keeps lastActivity fresh...');
    const beforeActivity = dbUser1.lastActivity;
    // sleep 50ms
    await new Promise((r) => setTimeout(r, 50));
    await authenticateToken(loginResult1.accessToken);
    const dbUserAfterReq = await User.findById(user._id);
    if (dbUserAfterReq.lastActivity <= beforeActivity) {
      throw new Error('Test 4 Failed: lastActivity was not bumped on protected request');
    }
    console.log('✓ Test 4 Passed: lastActivity updated from', beforeActivity.toISOString(), 'to', dbUserAfterReq.lastActivity.toISOString());

    // -------------------------------------------------------------
    // Test 5: Logout then login again (Expect 200)
    // -------------------------------------------------------------
    console.log('\n[Test 5] Logout then login again...');
    await authService.logout(user._id);
    const dbUserAfterLogout = await User.findById(user._id);
    if (dbUserAfterLogout.activeSessionId !== null || dbUserAfterLogout.lastActivity !== null) {
      throw new Error('Test 5 Failed: activeSessionId and lastActivity were not cleared on logout');
    }
    const loginResult2 = await authService.login(testEmail, rawPassword);
    if (!loginResult2.accessToken) throw new Error('Test 5 Failed: login after logout did not return accessToken');
    console.log('✓ Test 5 Passed: Logout cleared session and re-login succeeded');

    // -------------------------------------------------------------
    // Test 6: Login after timeout (Expect 200 because previous session expired)
    // -------------------------------------------------------------
    console.log('\n[Test 6] Login after timeout...');
    // Manually backdate lastActivity to 35 minutes ago
    const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);
    await User.updateOne({ _id: user._id }, { $set: { lastActivity: thirtyFiveMinutesAgo } });

    // A protected request with the old token should now fail with "Session timed out"
    let caught401TimedOut = false;
    try {
      await authenticateToken(loginResult2.accessToken);
    } catch (err) {
      if (err.message === 'Session timed out') {
        caught401TimedOut = true;
      }
    }
    if (!caught401TimedOut) {
      throw new Error('Test 6 Failed: Protected request after timeout did not fail with "Session timed out"');
    }
    console.log('✓ Test 6a Passed: Protected request failed with "Session timed out"');

    // Now attempt a new login: should succeed because lastActivity is older than timeout!
    const loginResult3 = await authService.login(testEmail, rawPassword);
    if (!loginResult3.accessToken) throw new Error('Test 6 Failed: Login after timeout failed');
    console.log('✓ Test 6b Passed: Login after timeout succeeded atomically');

    // -------------------------------------------------------------
    // Test 7: Admin session reset (Expect activeSessionId cleared)
    // -------------------------------------------------------------
    console.log('\n[Test 7] Admin reset session...');
    const adminService = require('./src/modules/admin/admin.service');
    const resetUser = await adminService.resetUserSession(user._id);
    if (resetUser.activeSessionId !== null || resetUser.lastActivity !== null) {
      throw new Error('Test 7 Failed: Admin reset did not clear activeSessionId and lastActivity');
    }
    const loginResult4 = await authService.login(testEmail, rawPassword);
    if (!loginResult4.accessToken) throw new Error('Test 7 Failed: Login after admin reset failed');
    console.log('✓ Test 7 Passed: Admin reset cleared session and user logged in successfully');

    console.log('\n===========================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY (7/7)!');
    console.log('===========================================');
  } finally {
    await User.deleteOne({ _id: user._id });
    console.log('Cleaned up test user.');
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});
