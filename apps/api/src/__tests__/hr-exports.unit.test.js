'use strict';
process.env.NODE_ENV = 'test';
process.env.REDIS_CACHE_URL = 'redis://localhost:6379/0';
process.env.REDIS_PUBSUB_URL = 'redis://localhost:6379/1';
process.env.REDIS_QUEUE_URL = 'redis://localhost:6379/2';

const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeCsvCell, generateSanitizedCsv } = require('../modules/hr/hr.calculations');

// ── Pure formula injection defense tests ──────────────────────────────────
test('CSV export formula injection defense & RFC 4180 compliance', async (t) => {
  await t.test('Name starting with "=" is neutralized with leading single-quote', () => {
    assert.equal(sanitizeCsvCell('=1+1'), "'=1+1");
    assert.equal(sanitizeCsvCell('=cmd|/C calc.exe'), "'=cmd|/C calc.exe");
    assert.equal(sanitizeCsvCell('=DangerUser'), "'=DangerUser");
  });

  await t.test('Names starting with +, -, @, or tab are neutralized', () => {
    assert.equal(sanitizeCsvCell('+SUM(A1:B10)'), "'+SUM(A1:B10)");
    assert.equal(sanitizeCsvCell('-100'), "'-100");
    assert.equal(sanitizeCsvCell('@username'), "'@username");
    assert.equal(sanitizeCsvCell('\tsecret'), "'\tsecret");
  });

  await t.test('Regular values are unaffected', () => {
    assert.equal(sanitizeCsvCell('John Doe'), 'John Doe');
    assert.equal(sanitizeCsvCell(123), '123');
    assert.equal(sanitizeCsvCell(null), '');
    assert.equal(sanitizeCsvCell(undefined), '');
  });

  await t.test('RFC 4180: commas, quotes, and newlines are quoted and escaped', () => {
    const csv = generateSanitizedCsv({
      headers: ['Name', 'Title'],
      rows: [
        ['=Evil, Name', 'Said "Hello"'],
        ['Normal', 'Line 1\nLine 2'],
      ],
    });

    const lines = csv.split('\r\n');
    assert.equal(lines[0], 'Name,Title');
    // =Evil, Name becomes '=Evil, Name; since it has a comma, wrapped in quotes: "'=Evil, Name"
    assert.equal(lines[1], '"\'=Evil, Name","Said ""Hello"""');
    // Multiline field is wrapped in quotes
    assert.ok(csv.includes('"Line 1\nLine 2"'));
  });
});

// ── In-memory state & mocks for router tests ────────────────────────────────
const LEAD_ID   = '111111111111111111110001'; // Leads Team 1 and Team 2
const LEAD_OTHER = '111111111111111111110002'; // Leads Team 3
const MEMBER_ID = '222222222222222222220001'; // In Team 1
const MEMBER_2  = '222222222222222222220002'; // In Team 2
const MEMBER_3  = '222222222222222222220003'; // In Team 3
const ADMIN_ID  = '333333333333333333330001';
const TEAM_ID   = '444444444444444444440001';
const TEAM_2_ID = '444444444444444444440002';
const TEAM_3_ID = '444444444444444444440003';

const teamsData = [
  { _id: TEAM_ID,   leadId: LEAD_ID,    members: [MEMBER_ID] },
  { _id: TEAM_2_ID, leadId: LEAD_ID,    members: [MEMBER_2] },
  { _id: TEAM_3_ID, leadId: LEAD_OTHER, members: [MEMBER_3] },
];

const sampleIncidents = [
  {
    _id: 'inc1',
    employeeId: MEMBER_ID,
    employeeName: '=Exploit User', // Test formula neutralization in real export
    teamId: TEAM_ID,
    date: '2026-03-01',
    feedbackType: 'NEGATIVE',
    severity: 'HIGH',
    title: 'Incident Team 1',
    narrative: 'Testing =cmd injection in CSV',
    loggedByName: 'Lead Multi',
    isResolved: false,
    isDeleted: false,
    resolutionNotes: '',
  },
  {
    _id: 'inc2',
    employeeId: MEMBER_2,
    employeeName: 'Bob Member',
    teamId: TEAM_2_ID,
    date: '2026-03-02',
    feedbackType: 'POSITIVE',
    severity: 'LOW',
    title: 'Incident Team 2',
    narrative: 'Great collaboration in Team 2',
    loggedByName: 'Lead Multi',
    isResolved: true,
    isDeleted: false,
    resolutionNotes: 'Resolved note',
  },
  {
    _id: 'inc3',
    employeeId: MEMBER_3,
    employeeName: 'Charlie Member',
    teamId: TEAM_3_ID,
    date: '2026-03-03',
    feedbackType: 'NEUTRAL',
    severity: 'MEDIUM',
    title: 'Incident Team 3',
    narrative: 'Incident in Team 3 by Other Lead',
    loggedByName: 'Other Lead',
    isResolved: false,
    isDeleted: false,
    resolutionNotes: '',
  },
];

const Module = require('module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.includes('hr.incidents.model')) {
    return {
      find(filter = {}) {
        return {
          sort() {
            return {
              lean() {
                let list = sampleIncidents.filter((i) => !i.isDeleted);
                if (filter.teamId) {
                  if (filter.teamId.$in) list = list.filter((i) => filter.teamId.$in.map(String).includes(String(i.teamId)));
                  else list = list.filter((i) => String(i.teamId) === String(filter.teamId));
                }
                if (filter.employeeId) {
                  if (filter.employeeId.$in) list = list.filter((i) => filter.employeeId.$in.map(String).includes(String(i.employeeId)));
                  else list = list.filter((i) => String(i.employeeId) === String(filter.employeeId));
                }
                return Promise.resolve(list);
              },
            };
          },
        };
      },
    };
  }
  if (request.includes('hr.reviews.model')) {
    return {
      find() {
        return {
          sort() {
            return { lean() { return Promise.resolve([]); } };
          },
        };
      },
    };
  }
  if (request.endsWith('attendance.model') || request.includes('attendance/attendance.model')) {
    return {
      find() {
        return {
          select() {
            return { lean() { return Promise.resolve([]); } };
          },
        };
      },
    };
  }
  if (request.endsWith('teams.model') || request.includes('teams/teams.model')) {
    return {
      find({ leadId } = {}) {
        const leadStr = leadId?.toString();
        const matched = teamsData.filter((t) => !leadStr || String(t.leadId) === leadStr);
        return {
          select() {
            return {
              lean() { return Promise.resolve(matched); },
            };
          },
        };
      },
      findById(id) {
        const t = teamsData.find((x) => String(x._id) === String(id));
        return Promise.resolve(t || null);
      },
    };
  }
  if (request.endsWith('admin.model') || request.includes('admin/admin.model')) {
    const usersMap = new Map([
      [MEMBER_ID, { _id: MEMBER_ID, name: '=Exploit User' }],
      [MEMBER_2,  { _id: MEMBER_2,  name: 'Bob Member' }],
      [MEMBER_3,  { _id: MEMBER_3,  name: 'Charlie Member' }],
    ]);
    return {
      find({ _id } = {}) {
        const ids = (_id?.$in || []).map(String);
        const users = Array.from(usersMap.values()).filter((u) => ids.includes(u._id));
        return {
          select() {
            return { lean() { return Promise.resolve(users); } };
          },
        };
      },
      findById(id) {
        return {
          select() {
            return { lean() { return Promise.resolve(usersMap.get(String(id)) || null); } };
          },
        };
      },
    };
  }
  return origLoad.apply(this, arguments);
};

// Clear caches
delete require.cache[require.resolve('../modules/hr/hr.exports.controller')];
delete require.cache[require.resolve('../modules/hr/hr.exports.routes')];

const authMw = require('../modules/auth/auth.middleware');
let currentUser = null;
const origProtect = authMw.protect;
authMw.protect = (req, res, next) => {
  if (!currentUser) return res.status(401).json({ success: false, message: 'Unauthenticated' });
  req.user = currentUser;
  next();
};

const exportsRouter = require('../modules/hr/hr.exports.routes');
Module._load = origLoad;

function runRoute(method, url, { user, query } = {}) {
  currentUser = user || null;
  return new Promise((resolve) => {
    const qStr = query ? '?' + new URLSearchParams(query).toString() : '';
    const req = {
      method,
      url: url + qStr,
      originalUrl: `/api/v1/hr${url}${qStr}`,
      headers: {},
      ip: '127.0.0.1',
      body: {},
      query: query || {},
      params: {},
    };
    let statusCode = 200;
    let headers = {};
    let responseData = '';
    const res = {
      statusCode: 200,
      setHeader(name, val) {
        headers[name.toLowerCase()] = val;
      },
      status(code) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data) {
        responseData = data;
        resolve({ statusCode, headers, body: responseData });
        return this;
      },
      send(data) {
        responseData = data;
        resolve({ statusCode, headers, body: responseData });
        return this;
      },
    };
    exportsRouter.handle(req, res, (err) => {
      if (err) resolve({ statusCode: err.statusCode || 500, headers, body: err.message });
      else resolve({ statusCode: statusCode || 404, headers, body: responseData });
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────
test('CSV Exports: Access rules, Formula neutralization in live route', async (t) => {
  await new Promise((r) => setTimeout(r, 400));

  await t.test('T1 is denied export (403)', async () => {
    const res = await runRoute('GET', '/export/incidents', {
      user: { sub: 't1', role: 'T1_VOLUNTEER' },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('T2 is denied export (403)', async () => {
    const res = await runRoute('GET', '/export/incidents', {
      user: { sub: 't2', role: 'T2_ASSOCIATE' },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('T3 can export incidents with CSV formula injection neutralization (200)', async () => {
    const res = await runRoute('GET', '/export/incidents', {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8');
    assert.ok(res.headers['content-disposition'].includes('attachment'));

    // Critical assertion: '=Exploit User' must be neutralized with a leading single quote: "'=Exploit User"
    assert.ok(res.body.includes("'=Exploit User"), 'Formula injection neutralized in CSV payload');
    assert.ok(!res.body.includes(',=Exploit User,'), 'Raw unescaped formula prefix must not appear');
  });

  await t.test('ADMIN with default permissions can export (200)', async () => {
    const res = await runRoute('GET', '/export/incidents', {
      user: { sub: ADMIN_ID, role: 'ADMIN' },
    });
    assert.equal(res.statusCode, 200);
  });

  await t.test('ADMIN with customGrants missing hr:export is denied (403)', async () => {
    const res = await runRoute('GET', '/export/incidents', {
      user: { sub: ADMIN_ID, role: 'ADMIN', customGrants: ['events:read'] },
    });
    assert.equal(res.statusCode, 403);
  });

  await t.test('Two teams and two leads: a T3 exports only incidents of their own members', async () => {
    const res = await runRoute('GET', '/export/incidents', {
      user: { sub: LEAD_OTHER, role: 'T3_EXECUTIVE' },
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.includes('Incident Team 3'), 'Exports member of own led team');
    assert.ok(res.body.includes('Charlie Member'), 'Includes own member name');
    assert.ok(!res.body.includes('Incident Team 1'), 'Excludes members of Team 1');
    assert.ok(!res.body.includes('Incident Team 2'), 'Excludes members of Team 2');
    assert.ok(!res.body.includes('Bob Member'), 'Excludes Bob Member');
  });

  await t.test('Two teams and two leads: a T3 leading two teams gets both in export', async () => {
    const res = await runRoute('GET', '/export/incidents', {
      user: { sub: LEAD_ID, role: 'T3_EXECUTIVE' },
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.includes('Incident Team 1'), 'Includes members of led Team 1');
    assert.ok(res.body.includes('Incident Team 2'), 'Includes members of led Team 2');
    assert.ok(res.body.includes('Bob Member'), 'Includes Bob Member from Team 2');
    assert.ok(!res.body.includes('Incident Team 3'), 'Excludes members of unled Team 3');
    assert.ok(!res.body.includes('Charlie Member'), 'Excludes Charlie Member from Team 3');
  });

  // Restore protect
  authMw.protect = origProtect;
});
