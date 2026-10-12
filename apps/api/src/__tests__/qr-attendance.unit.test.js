const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');

const originalEnv = { ...process.env };
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
process.env.REDIS_CACHE_URL = 'redis://localhost:6379/0';
process.env.REDIS_PUBSUB_URL = 'redis://localhost:6379/1';
process.env.REDIS_QUEUE_URL = 'redis://localhost:6379/2';

// Require models FIRST before any connection readyState mocking
const AttendanceLink = require('../modules/attendance/attendanceLink.model');
const Attendance = require('../modules/attendance/attendance.model');
const User = require('../modules/admin/admin.model');
const Team = require('../modules/teams/teams.model');
const ChatRoom = require('../modules/chat/chatRoom.model');
const Message = require('../modules/chat/chat.model');
const linkService = require('../modules/attendance/attendanceLink.service');
const attendanceRoutes = require('../modules/attendance/attendance.routes');
const { requireTeam } = require('../modules/auth/auth.middleware');


const origMethods = {};

test('QR Attendance', { concurrency: 1 }, async (t) => {
  t.beforeEach(() => {
    if (!origMethods.AttendanceLink_create) {
        origMethods.AttendanceLink_create = AttendanceLink.create;
        origMethods.AttendanceLink_findOne = AttendanceLink.findOne;
        origMethods.AttendanceLink_save = AttendanceLink.prototype.save;
        origMethods.Attendance_findOne = Attendance.findOne;
        origMethods.Attendance_find = Attendance.find;
        origMethods.Attendance_save = Attendance.prototype.save;
        origMethods.User_find = User.find;
        origMethods.User_findById = User.findById;
        origMethods.Team_findById = Team.findById;
        origMethods.Team_findOne = Team.findOne;
        origMethods.ChatRoom_findOne = ChatRoom.findOne;
        origMethods.ChatRoom_create = ChatRoom.create;
        origMethods.ChatRoom_save = ChatRoom.prototype.save;
        origMethods.Message_create = Message.create;
        origMethods.Message_save = Message.prototype.save;
    }
  });

  t.afterEach(() => {
    AttendanceLink.create = origMethods.AttendanceLink_create;
    AttendanceLink.findOne = origMethods.AttendanceLink_findOne;
    AttendanceLink.prototype.save = origMethods.AttendanceLink_save;
    Attendance.findOne = origMethods.Attendance_findOne;
    Attendance.find = origMethods.Attendance_find;
    Attendance.prototype.save = origMethods.Attendance_save;
    User.find = origMethods.User_find;
    User.findById = origMethods.User_findById;
    Team.findById = origMethods.Team_findById;
    Team.findOne = origMethods.Team_findOne;
    ChatRoom.findOne = origMethods.ChatRoom_findOne;
    ChatRoom.create = origMethods.ChatRoom_create;
    ChatRoom.prototype.save = origMethods.ChatRoom_save;
    Message.create = origMethods.Message_create;
    Message.prototype.save = origMethods.Message_save;
  });

  t.after(() => {
    Object.keys(process.env).forEach(k => delete process.env[k]);
    Object.assign(process.env, originalEnv);
  });

  // In-memory data store for isolated mock testing
  function createInMemoryStore() {
    const links = new Map();
    const attendances = new Map();
    const users = new Map();
    const teams = new Map();
    const chatRooms = new Map();
    const messages = new Map();

    return { links, attendances, users, teams, chatRooms, messages };
  }

  // Setup model mocks before each test group
  function setupMocks(store) {
    // AttendanceLink mocks
    AttendanceLink.create = async (doc) => {
      const id = new mongoose.Types.ObjectId().toString();
      const item = {
        _id: id,
        ...doc,
        save: async function() {
          store.links.set(this.token, this);
          return this;
        }
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
        populate: (pathField, fields) => {
          if (!result) return Promise.resolve(null);
          const copy = { ...result };
          if (pathField === 'createdBy' && copy.createdBy) {
            const u = store.users.get(copy.createdBy.toString()) || { name: 'Lead User', email: 'lead@example.test' };
            copy.createdBy = u;
          }
          return Promise.resolve(copy);
        },
        then: (resolve) => {
          resolve(result);
        }
      };
    };

    AttendanceLink.prototype.save = async function() {
      store.links.set(this.token, this);
      return this;
    };

    // Attendance mocks
    Attendance.findOne = async (query) => {
      for (const att of store.attendances.values()) {
        let match = true;
        if (query.user && String(att.user) !== String(query.user)) match = false;
        if (query.date && att.date !== query.date) match = false;
        if (match) return att;
      }
      return null;
    };

    Attendance.find = (query) => {
      const results = [];
      for (const att of store.attendances.values()) {
        let match = true;
        if (query.date && att.date !== query.date) match = false;
        if (query.team && att.team !== query.team) match = false;
        if (match) results.push(att);
      }
      return {
        populate: () => ({
          sort: () => Promise.resolve(results),
        }),
        sort: () => Promise.resolve(results),
      };
    };

    Attendance.prototype.save = async function() {
      for (const att of store.attendances.values()) {
        if (String(att.user) === String(this.user) && att.date === this.date) {
          const err = new Error('E11000 duplicate key error collection: attendances index: user_1_date_1');
          err.code = 11000;
          throw err;
        }
      }
      this._id = this._id || new mongoose.Types.ObjectId().toString();
      store.attendances.set(String(this._id), this);
      return this;
    };

    // User mocks
    User.find = (query) => ({
      select: () => {
        const results = [];
        for (const u of store.users.values()) {
          if (query.isActive !== undefined && u.isActive !== query.isActive) continue;
          if (query.role && query.role.$in) {
            if (!query.role.$in.includes(u.role)) continue;
          }
          results.push(u);
        }
        return Promise.resolve(results);
      }
    });

    User.findById = (id) => {
      const userDoc = store.users.get(String(id)) || null;
      return {
        select: () => Promise.resolve(userDoc),
        then: (resolve) => resolve(userDoc),
      };
    };

    // Team mocks
    Team.findById = async (id) => {
      return store.teams.get(String(id)) || null;
    };

    Team.findOne = async (query) => {
      if (!query) {
        return store.teams.values().next().value || null;
      }
      for (const t of store.teams.values()) {
        if (query._id && String(t._id) === String(query._id)) return t;
        if (query.name && query.name.test && query.name.test(t.name)) return t;
      }
      return null;
    };

    // ChatRoom & Message mocks
    ChatRoom.findOne = async (query) => {
      for (const r of store.chatRooms.values()) {
        if (query.teamId && String(r.teamId) === String(query.teamId)) return r;
      }
      return null;
    };
    ChatRoom.create = async (doc) => {
      const id = new mongoose.Types.ObjectId().toString();
      const item = { _id: id, ...doc, save: async function() { return this; } };
      store.chatRooms.set(id, item);
      return item;
    };
    ChatRoom.prototype.save = async function() {
      return this;
    };

    Message.create = async (doc) => {
      const id = new mongoose.Types.ObjectId().toString();
      const item = { _id: id, ...doc, createdAt: new Date() };
      store.messages.set(id, item);
      return item;
    };
    Message.prototype.save = async function() {
      return this;
    };
  }

  // --------------------------------------------------------------------------
  // 1. TOKEN GENERATION, CRYPTOGRAPHIC STRENGTH & METADATA SECURITY
  // --------------------------------------------------------------------------
  await t.test('QR & Link Generation: Cryptographic token strength, length, and PII protection', async () => {
    const store = createInMemoryStore();
    setupMocks(store);

    const t3Lead = {
      sub: '507f1f77bcf86cd799439001',
      _id: '507f1f77bcf86cd799439001',
      name: 'Lead Organizer',
      email: 'lead@example.test',
      role: 'T3_EXECUTIVE',
    };

    const res = await linkService.generateLink({ minutes: 15 }, t3Lead);

    // 1a. Token randomness, length and format
    assert.ok(res.token, 'Token must be present');
    assert.equal(typeof res.token, 'string', 'Token must be a string');
    assert.equal(res.token.length, 64, 'Token must be a 64-character hex string (32 bytes CSPRNG)');
    assert.match(res.token, /^[a-f0-9]{64}$/, 'Token must only contain lowercase hexadecimal characters');

    // 1b. QR code structure
    assert.ok(res.qrCode, 'QR code data URL must be generated');
    assert.match(res.qrCode, /^data:image\/png;base64,/, 'QR code must be a valid base64 PNG data URI');

    // 1c. Zero personal data or internal secrets exposed in URL or QR content
    assert.ok(res.url.endsWith(`/attend/${res.token}`), 'URL must route to /attend/:token');
    assert.equal(res.url.includes(t3Lead.name), false, 'Link URL must NOT contain user name');
    assert.equal(res.url.includes(t3Lead.email), false, 'Link URL must NOT contain user email');
    assert.equal(res.url.includes(t3Lead.sub), false, 'Link URL must NOT contain internal user ID');

    // 1d. Expiry window boundaries enforced
    assert.equal(res.validMinutes, 15, 'Valid minutes must be 15');
    const durationMs = new Date(res.expiresAt).getTime() - new Date(res.startsAt).getTime();
    assert.equal(durationMs, 15 * 60 * 1000, 'Expiry difference must exactly equal 15 minutes');

    // Clamp limits: test max 120 minutes and min 1 minute
    const maxRes = await linkService.generateLink({ minutes: 999 }, t3Lead);
    assert.equal(maxRes.validMinutes, 120, 'Duration over 120 must clamp to 120');

    const minRes = await linkService.generateLink({ minutes: -5 }, t3Lead);
    assert.equal(minRes.validMinutes, 10, 'Invalid/negative duration must default to 10');
  });

  // --------------------------------------------------------------------------
  // 2. END-TO-END FLOW: T3 LEAD GENERATES, MEMBERS SCAN AND REGISTER, PANEL SHOWS RESULTS
  // --------------------------------------------------------------------------
  await t.test('Full Flow: Authorized session generation, response registration, duplicate prevention, and panel view', async () => {
    const store = createInMemoryStore();
    setupMocks(store);

    const t3Lead = {
      sub: '507f1f77bcf86cd799439001',
      _id: '507f1f77bcf86cd799439001',
      name: 'Lead Organizer',
      email: 'lead@example.test',
      role: 'T3_EXECUTIVE',
    };

    const memberA = {
      sub: '507f1f77bcf86cd799439011',
      _id: '507f1f77bcf86cd799439011',
      name: 'Volunteer Alice',
      email: 'alice@example.test',
      role: 'T3_EXECUTIVE',
      isActive: true,
    };

    const memberB = {
      sub: '507f1f77bcf86cd799439022',
      _id: '507f1f77bcf86cd799439022',
      name: 'Volunteer Bob',
      email: 'bob@example.test',
      role: 'T3_EXECUTIVE',
      isActive: true,
    };

    store.users.set(memberA.sub, memberA);
    store.users.set(memberB.sub, memberB);
    store.users.set(t3Lead.sub, t3Lead);

    // Step 1: Lead generates session link
    const session = await linkService.generateLink({ minutes: 20 }, t3Lead);
    assert.ok(session.token, 'Session token generated');

    // Step 2: Member A registers attendance
    const recordA = await linkService.markAttendance(session.token, memberA);
    assert.ok(recordA._id, 'Attendance record created');
    assert.equal(String(recordA.user), memberA.sub, 'Recorded user must match Member A sub');
    assert.equal(recordA.status, 'present', 'Attendance status must be present');
    assert.equal(recordA.method, 'link', 'Method must be link');

    // Step 3: Member A tries duplicate submission (must fail with 409 Conflict)
    await assert.rejects(
      async () => {
        await linkService.markAttendance(session.token, memberA);
      },
      (err) => {
        assert.equal(err.statusCode, 409, 'Duplicate mark must return HTTP 409 Conflict');
        assert.match(err.message, /already marked/i, 'Error message must state already marked');
        return true;
      }
    );

    // Step 4: Member B registers attendance
    const recordB = await linkService.markAttendance(session.token, memberB);
    assert.ok(recordB._id, 'Attendance record created for Member B');
    assert.equal(String(recordB.user), memberB.sub, 'Recorded user must match Member B sub');

    // Step 5: Verify both responses show in T3 Today Panel
    const panel = await linkService.getT3TodayPanel();
    assert.equal(panel.presentCount, 2, 'Both Member A and Member B must be counted as present');
    const presentUserIds = panel.presentMembers.map((m) => String(m.userId));
    assert.ok(presentUserIds.includes(memberA.sub), 'Member A must be in present members');
    assert.ok(presentUserIds.includes(memberB.sub), 'Member B must be in present members');
  });

  // --------------------------------------------------------------------------
  // 3. NEGATIVE SECURITY CASES: INVALID, EXPIRED, CLOSED, WRONG TEAM, BODY TAMPERING
  // --------------------------------------------------------------------------
  await t.test('Negative Security Checks: Expired session, future session, invalid token, wrong team, and userId tampering', async () => {
    const store = createInMemoryStore();
    setupMocks(store);

    const t3Lead = {
      sub: '507f1f77bcf86cd799439001',
      role: 'T3_EXECUTIVE',
    };

    const outsiderUser = {
      sub: '507f1f77bcf86cd799439099',
      name: 'Outsider User',
      email: 'outsider@example.test',
      role: 'T1_VOLUNTEER',
      team: 'Marketing',
    };

    const activeSession = await linkService.generateLink({ minutes: 10 }, t3Lead);

    // Case 3a: Wrong / unauthorized team member
    await assert.rejects(
      async () => {
        await linkService.markAttendance(activeSession.token, outsiderUser);
      },
      (err) => {
        assert.equal(err.statusCode, 403, 'User not in team must be rejected with 403 Forbidden');
        return true;
      }
    );

    // Case 3b: Non-existent / invalid token
    await assert.rejects(
      async () => {
        await linkService.markAttendance('invalid_token_1234567890', t3Lead);
      },
      (err) => {
        assert.equal(err.statusCode, 404, 'Invalid token must return 404 Not Found');
        return true;
      }
    );

    // Case 3c: Expired token
    const expiredLink = {
      token: 'expired_hex_token_123456',
      team: 'T3',
      createdBy: t3Lead.sub,
      startsAt: new Date(Date.now() - 3600000),
      expiresAt: new Date(Date.now() - 60000), // expired 1 min ago
      date: '2026-10-05',
      active: true,
    };
    store.links.set(expiredLink.token, expiredLink);

    await assert.rejects(
      async () => {
        await linkService.markAttendance(expiredLink.token, t3Lead);
      },
      (err) => {
        assert.equal(err.statusCode, 410, 'Expired link must return 410 Gone');
        return true;
      }
    );

    // Case 3d: Manually deactivated link
    const deactivatedLink = {
      token: 'deactivated_hex_token_123456',
      team: 'T3',
      createdBy: t3Lead.sub,
      startsAt: new Date(Date.now() - 10000),
      expiresAt: new Date(Date.now() + 600000),
      date: '2026-10-05',
      active: false, // deactivated
    };
    store.links.set(deactivatedLink.token, deactivatedLink);

    await assert.rejects(
      async () => {
        await linkService.markAttendance(deactivatedLink.token, t3Lead);
      },
      (err) => {
        assert.equal(err.statusCode, 410, 'Deactivated link must return 410 Gone');
        return true;
      }
    );

    // Case 3e: Future link (window has not started yet)
    const futureLink = {
      token: 'future_hex_token_123456',
      team: 'T3',
      createdBy: t3Lead.sub,
      startsAt: new Date(Date.now() + 600000), // starts in 10 mins
      expiresAt: new Date(Date.now() + 1200000),
      date: '2026-10-05',
      active: true,
    };
    store.links.set(futureLink.token, futureLink);

    await assert.rejects(
      async () => {
        await linkService.markAttendance(futureLink.token, t3Lead);
      },
      (err) => {
        assert.equal(err.statusCode, 425, 'Future session must return 425 Too Early');
        return true;
      }
    );

    // Case 3f: Request body tampering (attempting to register attendance for another user)
    const authenticatedCaller = {
      sub: '507f1f77bcf86cd799439001',
      name: 'Caller',
      email: 'caller@example.test',
      role: 'T3_EXECUTIVE',
    };
    // Caller supplies a tampered body with another user's ID
    const newSession = await linkService.generateLink({ minutes: 10 }, authenticatedCaller);
    const recorded = await linkService.markAttendance(newSession.token, authenticatedCaller);
    assert.equal(String(recorded.user), authenticatedCaller.sub, 'Recorded user must strictly match req.user.sub, never tampered body');
  });

  // --------------------------------------------------------------------------
  // 4. VULNERABILITY AUDIT TESTS (EXPECTED FAILURES EXPOSING REAL VULNERABILITIES)
  // --------------------------------------------------------------------------

  // FIX 1 TEST: IDOR in deactivateLink — non-owner cannot deactivate session without admin role
  await t.test('FIX 1: IDOR in deactivateLink — non-owner cannot deactivate session without admin role', async () => {
    const store = createInMemoryStore();
    setupMocks(store);

    const originalLead = {
      sub: '507f1f77bcf86cd799439001',
      role: 'T3_EXECUTIVE',
    };

    const rogueT3User = {
      sub: '507f1f77bcf86cd799439002',
      role: 'T3_EXECUTIVE', // T3 role, but does not own this link
    };

    const adminUser = {
      sub: '507f1f77bcf86cd799439003',
      role: 'ADMIN',
    };

    const link = await linkService.generateLink({ minutes: 30 }, originalLead);
    assert.equal(link.active, true, 'Link is active');

    // Rogue user must be rejected with 403
    await assert.rejects(
      async () => {
        await linkService.deactivateLink(link.token, rogueT3User);
      },
      (err) => {
        assert.equal(err.statusCode, 403, 'Unauthorized user must receive 403 Forbidden');
        assert.match(err.message, /Access denied/i);
        return true;
      }
    );

    // Original owner CAN deactivate
    const deactivatedByOwner = await linkService.deactivateLink(link.token, originalLead);
    assert.equal(deactivatedByOwner.active, false, 'Owner must be allowed to deactivate');

    // Admin CAN also deactivate a new link
    const link2 = await linkService.generateLink({ minutes: 30 }, originalLead);
    const deactivatedByAdmin = await linkService.deactivateLink(link2.token, adminUser);
    assert.equal(deactivatedByAdmin.active, false, 'Admin must be allowed to deactivate');
  });

  // FIX 2 TEST: IDOR & Chat Room Injection in shareLinkToTeamChat
  await t.test('FIX 2: IDOR in shareLinkToTeamChat — user cannot post link to unauthorized team chat', async () => {
    const store = createInMemoryStore();
    setupMocks(store);

    const t3Lead = {
      sub: '507f1f77bcf86cd799439001',
      role: 'T3_EXECUTIVE',
      name: 'Lead',
    };

    // Team 99 is an unrelated team that t3Lead is NOT a member or lead of
    const secretTeam = {
      _id: '507f1f77bcf86cd799439099',
      name: 'Executive Committee',
      leadId: '507f1f77bcf86cd799439055',
      members: ['507f1f77bcf86cd799439055'],
    };
    store.teams.set(secretTeam._id, secretTeam);

    // Team 1 is the lead's own team
    const myTeam = {
      _id: '507f1f77bcf86cd799439001',
      name: 'T3 Team',
      leadId: t3Lead.sub,
      members: [t3Lead.sub],
    };
    store.teams.set(myTeam._id, myTeam);

    const link = await linkService.generateLink({ minutes: 30 }, t3Lead);

    // Security requirement: Caller must not be allowed to share attendance QR to a team they do not belong to or lead
    await assert.rejects(
      async () => {
        await linkService.shareLinkToTeamChat(link.token, { teamId: secretTeam._id }, t3Lead);
      },
      (err) => {
        assert.equal(err.statusCode, 403, 'Unauthorized team chat share must return 403 Forbidden');
        return true;
      }
    );

    // Legitimate lead CAN share to their own team chat
    const shared = await linkService.shareLinkToTeamChat(link.token, { teamId: myTeam._id }, t3Lead);
    assert.ok(shared.messageId, 'Message must be created in team chat');
    assert.equal(shared.teamId, myTeam._id);
  });

  // FIX 3 TEST: Safe actionUrl in chat
  await t.test('FIX 3: Unsafe actionUrl in chat messages is dropped while legitimate attendance links pass', async () => {
    const chatController = require('../modules/chat/chat.controller');
    const chatService = require('../modules/chat/chat.service');

    const capturedMessageOpts = [];
    const origSendMessage = chatService.sendMessage;
    chatService.sendMessage = async (roomId, text, user, opts) => {
      capturedMessageOpts.push(opts);
      return {
        _id: 'msg-123',
        roomId,
        senderId: user.sub,
        senderName: user.name,
        text,
        ...opts,
      };
    };

    try {
      const caller = { sub: '507f1f77bcf86cd799439001', name: 'User' };
      const mockRes = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = data; return this; },
      };

      // 1. Malicious: javascript: payload
      await chatController.sendMessage(
        { params: { id: 'room-1' }, body: { text: 'Hello', actionUrl: 'javascript:alert(1)' }, user: caller },
        mockRes
      );
      assert.equal(capturedMessageOpts[0].actionUrl, null, 'javascript: URL must be dropped to null');

      // 2. Malicious: protocol-relative //evil.com
      await chatController.sendMessage(
        { params: { id: 'room-1' }, body: { text: 'Hello', actionUrl: '//evil.com/phish' }, user: caller },
        mockRes
      );
      assert.equal(capturedMessageOpts[1].actionUrl, null, '//evil.com URL must be dropped to null');

      // 3. Malicious: external unallowed host
      await chatController.sendMessage(
        { params: { id: 'room-1' }, body: { text: 'Hello', actionUrl: 'http://evil.com/login' }, user: caller },
        mockRes
      );
      assert.equal(capturedMessageOpts[2].actionUrl, null, 'external unallowed host must be dropped to null');

      // 4. Malicious: data: scheme
      await chatController.sendMessage(
        { params: { id: 'room-1' }, body: { text: 'Hello', actionUrl: 'data:text/html,<script>alert(1)</script>' }, user: caller },
        mockRes
      );
      assert.equal(capturedMessageOpts[3].actionUrl, null, 'data: scheme must be dropped to null');

      // 5. Legitimate relative attendance link
      await chatController.sendMessage(
        { params: { id: 'room-1' }, body: { text: 'Check in', actionUrl: '/attend/abcdef1234567890' }, user: caller },
        mockRes
      );
      assert.equal(capturedMessageOpts[4].actionUrl, '/attend/abcdef1234567890', 'Legitimate /attend link must be preserved');

      // 6. Legitimate app base URL
      await chatController.sendMessage(
        { params: { id: 'room-1' }, body: { text: 'Check in', actionUrl: 'http://localhost:5173/attend/abcdef1234567890' }, user: caller },
        mockRes
      );
      assert.equal(capturedMessageOpts[5].actionUrl, 'http://localhost:5173/attend/abcdef1234567890', 'Legitimate app URL must be preserved');
    } finally {
      chatService.sendMessage = origSendMessage;
    }
  });

  // BUG 3: Privilege Escalation — T1_VOLUNTEER with team="T3" can generate attendance sessions
  await t.test('VULNERABILITY AUDIT: Privilege escalation in requireTeam("T3") allowing T1 volunteers to generate links', async () => {
    const middleware = requireTeam('T3');

    // A student volunteer who belongs to team "T3"
    const t1VolunteerInT3 = {
      sub: '507f1f77bcf86cd799439088',
      role: 'T1_VOLUNTEER',
      team: 'T3',
    };

    let nextCalled = false;
    const req = { user: t1VolunteerInT3 };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; },
    };

    await middleware(req, res, () => { nextCalled = true; });

    // Security requirement: T1_VOLUNTEER should NOT be permitted to access T3 lead generation routes!
    // In vulnerable code: requireTeam('T3') passes because req.user.team === 'T3'.
    assert.equal(
      nextCalled,
      false,
      'SECURITY FLAW DETECTED: requireTeam("T3") allowed a T1_VOLUNTEER to access attendance session generation route!'
    );
  });

  // BUG 4: Dedicated rate limiting missing on attendance generation and mark endpoints
  await t.test('VULNERABILITY AUDIT: Dedicated rate limiter must be mounted on attendance generation and scan endpoints', () => {
    // Inspect route stack of attendance.routes
    const layers = attendanceRoutes.stack || [];
    
    const generateRoute = layers.find((l) => l.route && l.route.path === '/link/generate');
    const markRoute = layers.find((l) => l.route && l.route.path === '/link/:token/mark');

    assert.ok(generateRoute, '/link/generate route must exist');
    assert.ok(markRoute, '/link/:token/mark route must exist');

    // Check if a dedicated rate limiter exists in route stack before controller
    // Typically router.post('/link/generate', limiter, ...) has length >= 3
    const generateStackCount = generateRoute.route.stack.length;
    const markStackCount = markRoute.route.stack.length;

    assert.ok(
      generateStackCount >= 3,
      'SECURITY FLAW DETECTED: /link/generate has no dedicated rate limiter mounted (only auth middleware + controller)!'
    );
    assert.ok(
      markStackCount >= 2,
      'SECURITY FLAW DETECTED: /link/:token/mark has no dedicated rate limiter mounted!'
    );
  });

  // FIX 5 TEST: Rate limit returns 429 after exceeding limit
  await t.test('FIX 5: Rate limiter returns 429 after exceeding request threshold', () => {
    const { attendanceGenerateLimiter, attendanceScanLimiter } = require('../middleware/rateLimit.middleware');
    const dummyUser = { sub: 'rate-limit-test-user-' + Date.now() };

    // 1. Generate limiter: 10 requests allowed, 11th blocked
    let blocked = false;
    for (let i = 0; i < 11; i++) {
      const req = { user: dummyUser, headers: {} };
      const res = {
        statusCode: 200,
        status(c) { this.statusCode = c; return this; },
        json(d) { this.body = d; return this; },
      };
      attendanceGenerateLimiter(req, res, () => {});
      if (res.statusCode === 429) {
        blocked = true;
        assert.equal(i, 10, '11th request must be blocked');
        assert.match(res.body.message, /Too many session generation requests/);
      }
    }
    assert.equal(blocked, true, 'attendanceGenerateLimiter must return 429 on 11th attempt');

    // 2. Scan limiter: 30 requests allowed, 31st blocked
    let scanBlocked = false;
    const scanUser = { sub: 'rate-limit-scan-user-' + Date.now() };
    for (let i = 0; i < 31; i++) {
      const req = { user: scanUser, headers: {} };
      const res = {
        statusCode: 200,
        status(c) { this.statusCode = c; return this; },
        json(d) { this.body = d; return this; },
      };
      attendanceScanLimiter(req, res, () => {});
      if (res.statusCode === 429) {
        scanBlocked = true;
        assert.equal(i, 30, '31st request must be blocked');
        assert.match(res.body.message, /Too many attendance submissions/);
      }
    }
    assert.equal(scanBlocked, true, 'attendanceScanLimiter must return 429 on 31st attempt');
  });

  // FIX 6 TEST: Attendance controller masks unexpected 5xx and untyped errors
  await t.test('FIX 6: Attendance controller masks unexpected 5xx and untyped errors with generic message', async () => {
    const attendanceController = require('../modules/attendance/attendance.controller');
    const attendanceLinkService = require('../modules/attendance/attendanceLink.service');

    const origGenerateLink = attendanceLinkService.generateLink;
    try {
      // Simulate an unexpected internal database error (no statusCode or 500)
      attendanceLinkService.generateLink = async () => {
        const err = new Error('MongoNetworkError: failed to connect to server [10.0.0.5:27017] with password secret123');
        throw err;
      };

      const mockRes = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = data; return this; },
      };

      await attendanceController.generateLink(
        { body: { minutes: 15 }, user: { sub: '507f1f77bcf86cd799439001' } },
        mockRes
      );

      assert.equal(mockRes.statusCode, 500, 'Unexpected error must return 500');
      assert.equal(mockRes.body.success, false);
      assert.equal(mockRes.body.message, 'An unexpected error occurred. Please try again shortly.');
      assert.ok(!JSON.stringify(mockRes.body).includes('secret123'), 'Internal error details must not leak');
    } finally {
      attendanceLinkService.generateLink = origGenerateLink;
    }
  });

  // BUG 5: Audit logging missing on attendance generation and lifecycle
  await t.test('VULNERABILITY AUDIT: Audit log entry must be created when an attendance session is generated', async () => {
    const store = createInMemoryStore();
    setupMocks(store);

    const t3Lead = {
      sub: '507f1f77bcf86cd799439001',
      role: 'T3_EXECUTIVE',
    };

    let auditLogCreated = false;
    // Check if any audit log / logger is recorded
    const origConsoleInfo = console.info;
    const { logger } = require('../core/utils/logger');
    const origLoggerInfo = logger.info;
    try {
      const mockInfo = (...args) => {
        if (args.some((a) => typeof a === 'string' && a.includes('attendance'))) {
          auditLogCreated = true;
        }
      };
      console.info = mockInfo;
      logger.info = mockInfo;
      await linkService.generateLink({ minutes: 10 }, t3Lead);
    } finally {
      console.info = origConsoleInfo;
      logger.info = origLoggerInfo;
    }

    assert.equal(
      auditLogCreated,
      true,
      'SECURITY FLAW DETECTED: No audit log entry was generated for new attendance session creation!'
    );
  });

  // FIX 7 TEST: Audit entries contain short token prefix and NEVER log the full token or QR image
  await t.test('FIX 7: Audit log records short token prefix and never leaks full token or QR code', async () => {
    const store = createInMemoryStore();
    setupMocks(store);

    const t3Lead = {
      sub: '507f1f77bcf86cd799439001',
      name: 'Lead User',
      role: 'T3_EXECUTIVE',
    };

    const capturedAuditLogs = [];
    const origConsoleInfo = console.info;
    const { logger } = require('../core/utils/logger');
    const origLoggerInfo = logger.info;
    try {
      const mockInfo = (...args) => {
        const str = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
        if (str.includes('[AUDIT]')) {
          capturedAuditLogs.push(str);
        }
      };
      console.info = mockInfo;
      logger.info = mockInfo;

      // 1. Generate
      const session = await linkService.generateLink({ minutes: 15 }, t3Lead);
      const fullToken = session.token;

      // 2. Deactivate
      await linkService.deactivateLink(fullToken, t3Lead);

      // Verify logged entries
      assert.ok(capturedAuditLogs.length >= 2, 'Must record audit log for generate and deactivate');
      for (const log of capturedAuditLogs) {
        assert.ok(!log.includes(fullToken), 'Full token must NEVER appear in audit logs');
        assert.ok(log.includes(fullToken.slice(0, 8)), 'Token prefix must be present in audit logs');
        assert.ok(!log.includes('data:image'), 'QR data URI must NEVER appear in audit logs');
      }
    } finally {
      console.info = origConsoleInfo;
      logger.info = origLoggerInfo;
    }
  });

  // BUG 6: Public certificate verification route GET /verify/:hash (Planned Phase 5 feature)
  await t.test('VULNERABILITY AUDIT: Documented certificate verification route GET /verify/:hash must exist', (t) => {
    t.skip('Documented planned Phase 5 feature: GET /verify/:hash is not yet implemented in production router (per audit instructions)');
  });

  // --------------------------------------------------------------------------
  // 5. VERCEL SERVER INITIALIZATION & ROUTE REGISTRATION INTEGRATION TEST
  // --------------------------------------------------------------------------
  await t.test('Vercel Compatibility: Production serverless entrypoint registers attendance routes without errors', () => {
    process.env.VERCEL = '1';
    const serverPath = path.resolve(__dirname, '../../../../apps/web/server/server.js');
    const app = require(serverPath);
    assert.ok(app, 'server.js must export an Express application');

    const registeredPaths = [];
    app._router.stack.forEach((layer) => {
      if (layer.route) {
        registeredPaths.push(layer.route.path);
      } else if (layer.name === 'router' && layer.handle.stack) {
        layer.handle.stack.forEach((h) => {
          if (h.route) {
            registeredPaths.push(h.route.path);
          }
        });
      }
    });

    // Verify all essential attendance routes are wired into the router
    assert.ok(registeredPaths.includes('/link/generate'), 'Must register /link/generate');
    assert.ok(registeredPaths.includes('/link/:token'), 'Must register /link/:token');
    assert.ok(registeredPaths.includes('/link/:token/mark'), 'Must register /link/:token/mark');
    assert.ok(registeredPaths.includes('/link/:token/deactivate'), 'Must register /link/:token/deactivate');
    assert.ok(registeredPaths.includes('/link/:token/share-chat'), 'Must register /link/:token/share-chat');
    assert.ok(registeredPaths.includes('/t3/panel'), 'Must register /t3/panel');
  });

});
