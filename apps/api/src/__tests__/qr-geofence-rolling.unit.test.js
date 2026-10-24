const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const mongoose = require('mongoose');

const originalEnv = { ...process.env };
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
process.env.REDIS_CACHE_URL = 'redis://localhost:6379/0';

const AttendanceLink = require('../modules/attendance/attendanceLink.model');
const Attendance = require('../modules/attendance/attendance.model');
const User = require('../modules/admin/admin.model');
const linkService = require('../modules/attendance/attendanceLink.service');
const { calculateHaversineDistance } = require('../modules/attendance/distance.util');
const { generateStepCode, verifyStepCode } = require('../modules/attendance/rollingCode.util');

const origMethods = {};

test('QR Geofencing, Rolling Code & Multi-Session', { concurrency: 1 }, async (t) => {
  t.beforeEach(() => {
    if (!origMethods.AttendanceLink_create) {
      origMethods.AttendanceLink_create = AttendanceLink.create;
      origMethods.AttendanceLink_findOne = AttendanceLink.findOne;
      origMethods.AttendanceLink_find = AttendanceLink.find;
      origMethods.Attendance_findOne = Attendance.findOne;
      origMethods.Attendance_find = Attendance.find;
      origMethods.Attendance_save = Attendance.prototype.save;
      origMethods.User_find = User.find;
    }
  });

  t.afterEach(() => {
    AttendanceLink.create = origMethods.AttendanceLink_create;
    AttendanceLink.findOne = origMethods.AttendanceLink_findOne;
    AttendanceLink.find = origMethods.AttendanceLink_find;
    Attendance.findOne = origMethods.Attendance_findOne;
    Attendance.find = origMethods.Attendance_find;
    Attendance.prototype.save = origMethods.Attendance_save;
    User.find = origMethods.User_find;
  });

  t.after(() => {
    Object.keys(process.env).forEach((k) => delete process.env[k]);
    Object.assign(process.env, originalEnv);
  });

  function createStore() {
    return {
      links: new Map(),
      attendances: new Map(),
      users: new Map(),
    };
  }

  function setupMocks(store) {
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
      for (const att of store.attendances.values()) {
        if (String(att.user) === String(this.user) && String(att.linkId) === String(this.linkId)) {
          const err = new Error('E11000 duplicate key error collection: attendances index: user_1_linkId_1');
          err.code = 11000;
          throw err;
        }
      }
      store.attendances.set(this._id || new mongoose.Types.ObjectId().toString(), this);
      return this;
    };

    User.find = () => ({
      select: () => Promise.resolve(Array.from(store.users.values())),
    });
  }

  // 1. Math: Haversine distance calculation
  await t.test('Haversine distance: accurate calculations and boundary conditions', () => {
    // Exact same point
    const zeroDist = calculateHaversineDistance(12.971598, 77.594566, 12.971598, 77.594566);
    assert.equal(Math.round(zeroDist), 0, 'Distance to same point must be 0');

    // Known distance: Bangalore Vidhana Soudha to Cubbon Park entrance (~450m)
    const dist = calculateHaversineDistance(12.9797, 77.5907, 12.9757, 77.5929);
    assert.ok(dist > 400 && dist < 550, `Distance should be approximately ~490m, got ${dist}`);
  });

  // 2. Rolling code HMAC generator and timingSafeEqual validator
  await t.test('Rolling code: HMAC generation, step-boundary tolerance, and token isolation', () => {
    const secret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const token = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const stepSeconds = 30;
    const now = 1700000000000;

    const currentCode = generateStepCode(secret, token, stepSeconds, now);
    assert.equal(currentCode.length, 6, 'Code must be 6 characters');
    assert.match(currentCode, /^[A-F0-9]{6}$/, 'Code must be uppercase hexadecimal');

    // Valid on current step T
    assert.ok(verifyStepCode(currentCode, secret, token, stepSeconds, now), 'Code must be valid at step T');

    // Valid on previous step T-1 (within grace window)
    const stepMs = stepSeconds * 1000;
    assert.ok(verifyStepCode(currentCode, secret, token, stepSeconds, now + stepMs), 'Code must remain valid at step T+1 (checked as T-1)');

    // Invalid on expired step T-2
    assert.equal(verifyStepCode(currentCode, secret, token, stepSeconds, now + stepMs * 2 + 100), false, 'Code must be rejected after 2 steps');

    // Invalid when candidate is wrong
    assert.equal(verifyStepCode('000000', secret, token, stepSeconds, now), false, 'Wrong code must be rejected');

    // Invalid when used on a different link token
    const diffToken = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    assert.equal(verifyStepCode(currentCode, secret, diffToken, stepSeconds, now), false, 'Code cannot be reused across different links');
  });

  // 3. Geofencing verification on mark
  await t.test('Geofencing: enforces 100m default / 30m / 50m radius and accuracy checks', async () => {
    const store = createStore();
    setupMocks(store);

    const t3Lead = { sub: '507f1f77bcf86cd799439001', name: 'Lead', role: 'T3_EXECUTIVE' };
    const member = { sub: '507f1f77bcf86cd799439002', name: 'Member', role: 'T3_EXECUTIVE' };
    store.users.set(t3Lead.sub, t3Lead);
    store.users.set(member.sub, member);

    // Venue at 12.971598, 77.594566 with default radius 100m
    const link = await linkService.generateLink({
      minutes: 15,
      geo: { enabled: true, lat: 12.971598, lng: 77.594566, radiusM: 100, maxAccuracyM: 80 },
    }, t3Lead);

    assert.equal(link.geo.radiusM, 100, 'Default radius must be 100m');

    // Case 3a: Coordinate inside radius (20m away) with good accuracy -> Succeeds
    const insideLat = 12.971700;
    const insideLng = 77.594566;
    const record = await linkService.markAttendance(link.token, member, {
      lat: insideLat,
      lng: insideLng,
      accuracy: 15,
    });
    assert.ok(record._id, 'Attendance marked inside venue');
    assert.equal(record.verification.geoResult, 'verified');

    // Case 3b: Location outside radius (500m away) -> Rejected with 403
    const farLat = 12.976000;
    const farLng = 77.594566;
    const memberFar = { sub: '507f1f77bcf86cd799439003', name: 'Member Far', role: 'T3_EXECUTIVE' };
    store.users.set(memberFar.sub, memberFar);

    await assert.rejects(
      async () => {
        await linkService.markAttendance(link.token, memberFar, {
          lat: farLat,
          lng: farLng,
          accuracy: 15,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403, 'Outside radius must return 403 Forbidden');
        assert.match(err.message, /outside the designated attendance venue/i);
        return true;
      }
    );

    // Case 3c: Inaccurate GPS (> maxAccuracyM) -> Rejected with 422
    const memberBlur = { sub: '507f1f77bcf86cd799439004', name: 'Member Blur', role: 'T3_EXECUTIVE' };
    store.users.set(memberBlur.sub, memberBlur);

    await assert.rejects(
      async () => {
        await linkService.markAttendance(link.token, memberBlur, {
          lat: insideLat,
          lng: insideLng,
          accuracy: 120, // maxAccuracy is 80
        });
      },
      (err) => {
        assert.equal(err.statusCode, 422, 'Poor accuracy must return 422 Unprocessable');
        assert.match(err.message, /accuracy is insufficient/i);
        return true;
      }
    );
  });

  // 4. Rolling code verification on mark
  await t.test('Rolling code: enforces active code and rejects expired/missing codes', async () => {
    const store = createStore();
    setupMocks(store);

    const t3Lead = { sub: '507f1f77bcf86cd799439001', name: 'Lead', role: 'T3_EXECUTIVE' };
    const member = { sub: '507f1f77bcf86cd799439002', name: 'Member', role: 'T3_EXECUTIVE' };
    store.users.set(t3Lead.sub, t3Lead);
    store.users.set(member.sub, member);

    const link = await linkService.generateLink({
      minutes: 15,
      rolling: { enabled: true, stepSeconds: 30 },
    }, t3Lead);

    assert.ok(link.rolling.enabled, 'Rolling must be enabled');

    // T3 lead can retrieve live rolling code
    const rollingInfo = await linkService.getRollingCode(link.token, t3Lead);
    assert.ok(rollingInfo.code, 'Live rolling code must be returned');
    assert.ok(rollingInfo.secondsRemaining > 0, 'Seconds remaining must be positive');

    // Missing code -> 400 Bad Request
    await assert.rejects(
      async () => {
        await linkService.markAttendance(link.token, member, {});
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /session code is required/i);
        return true;
      }
    );

    // Wrong code -> 403 Forbidden
    await assert.rejects(
      async () => {
        await linkService.markAttendance(link.token, member, { code: 'WRONG1' });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /invalid or expired session code/i);
        return true;
      }
    );

    // Correct code -> Success
    const successRecord = await linkService.markAttendance(link.token, member, { code: rollingInfo.code });
    assert.ok(successRecord._id);
    assert.equal(successRecord.method, 'qr_rolling');
  });

  // 5. Multi-session support: user attends Session 1 and Session 2 on the same calendar day
  await t.test('Multi-session: T3 can take attendance multiple times in a day and panel reflects each session', async () => {
    const store = createStore();
    setupMocks(store);

    const t3Lead = { sub: '507f1f77bcf86cd799439001', name: 'Lead', role: 'T3_EXECUTIVE' };
    const memberAlice = { sub: '507f1f77bcf86cd799439011', name: 'Alice', role: 'T3_EXECUTIVE' };
    store.users.set(t3Lead.sub, t3Lead);
    store.users.set(memberAlice.sub, memberAlice);

    // Session 1: Morning Briefing
    const session1 = await linkService.generateLink({
      minutes: 20,
      sessionLabel: 'Morning Briefing',
    }, t3Lead);

    // Session 2: Afternoon Workshop
    const session2 = await linkService.generateLink({
      minutes: 20,
      sessionLabel: 'Afternoon Workshop',
    }, t3Lead);

    // Alice marks Session 1
    const rec1 = await linkService.markAttendance(session1.token, memberAlice);
    assert.ok(rec1._id, 'Alice marked Session 1');
    assert.equal(rec1.sessionLabel, 'Morning Briefing');

    // Alice cannot mark Session 1 twice (409 Conflict)
    await assert.rejects(
      async () => {
        await linkService.markAttendance(session1.token, memberAlice);
      },
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.match(err.message, /already marked/i);
        return true;
      }
    );

    // Alice marks Session 2 on the same day -> Succeeds!
    const rec2 = await linkService.markAttendance(session2.token, memberAlice);
    assert.ok(rec2._id, 'Alice successfully marked Session 2 on the same day');
    assert.equal(rec2.sessionLabel, 'Afternoon Workshop');

    // Verify Panel returns multi-session breakdown
    const panel = await linkService.getT3TodayPanel();
    assert.ok(Array.isArray(panel.sessions), 'Panel must return sessions array');
    assert.equal(panel.sessions.length, 2, 'Both morning and afternoon sessions must be returned');

    const s1 = panel.sessions.find((s) => s.sessionLabel === 'Morning Briefing');
    const s2 = panel.sessions.find((s) => s.sessionLabel === 'Afternoon Workshop');
    assert.ok(s1 && s2, 'Both sessions found in panel');
    assert.equal(s1.presentCount, 1, 'Session 1 has 1 present member');
    assert.equal(s2.presentCount, 1, 'Session 2 has 1 present member');
  });

  // 6. Security: No secret or venue coordinates leaked in student getLinkInfo
  await t.test('Security: getLinkInfo does not expose secret or raw coordinates to attendees', async () => {
    const store = createStore();
    setupMocks(store);

    const t3Lead = { sub: '507f1f77bcf86cd799439001', name: 'Lead', role: 'T3_EXECUTIVE' };
    const member = { sub: '507f1f77bcf86cd799439002', name: 'Member', role: 'T3_EXECUTIVE' };
    store.users.set(t3Lead.sub, t3Lead);
    store.users.set(member.sub, member);

    const link = await linkService.generateLink({
      minutes: 15,
      geo: { enabled: true, lat: 12.971598, lng: 77.594566, radiusM: 100 },
      rolling: { enabled: true, stepSeconds: 30 },
    }, t3Lead);

    const info = await linkService.getLinkInfo(link.token, member);

    assert.equal(info.secret, undefined, 'Secret must never be present in getLinkInfo');
    assert.equal(info.geo.lat, undefined, 'Venue latitude must not be leaked');
    assert.equal(info.geo.lng, undefined, 'Venue longitude must not be leaked');
    assert.equal(info.geo.radiusM, 100, 'Radius threshold is safe to display');
    assert.equal(info.rolling.enabled, true, 'Rolling indicator is present');
  });
});
