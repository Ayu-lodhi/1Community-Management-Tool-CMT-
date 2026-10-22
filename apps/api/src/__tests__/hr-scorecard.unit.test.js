'use strict';
process.env.NODE_ENV = 'test';
process.env.REDIS_CACHE_URL = 'redis://localhost:6379/0';
process.env.REDIS_PUBSUB_URL = 'redis://localhost:6379/1';
process.env.REDIS_QUEUE_URL = 'redis://localhost:6379/2';

const test = require('node:test');
const assert = require('node:assert/strict');

const T1_USER_ID = '555555555555555555550001';
const T2_USER_ID = '555555555555555555550002';
const OTHER_USER = '555555555555555555550003';

const sampleReviews = [
  {
    _id: 'rev1',
    employeeId: T1_USER_ID,
    employeeName: 'Alice T1',
    period: '2026-03',
    maxWeightedScore: 50,
    obtainedWeightedScore: 45,
    netScorePercentage: 90,
    reviewerName: 'Lead Bob',
    notes: 'Outstanding contribution in Frontend tasks',
    items: [
      { factorName: 'Code Quality', benchmarkScore: 10, weight: 2, obtainedScore: 9 },
      { factorName: 'Teamwork', benchmarkScore: 10, weight: 3, obtainedScore: 9 },
    ],
  },
  {
    _id: 'rev2',
    employeeId: T2_USER_ID,
    employeeName: 'Bob T2',
    period: '2026-03',
    maxWeightedScore: 50,
    obtainedWeightedScore: 40,
    netScorePercentage: 80,
    reviewerName: 'Lead Charlie',
    notes: 'Good progress in API testing',
    items: [],
  },
];

const sampleAttendance = [
  { user: T1_USER_ID, date: '2026-03-01', status: 'present', method: 'qr' },
  { user: T1_USER_ID, date: '2026-03-02', status: 'late', method: 'qr' },
  { user: T1_USER_ID, date: '2026-03-03', status: 'absent', method: 'qr' },
  { user: T1_USER_ID, date: '2026-03-04', status: 'present', method: 'qr' },
  { user: T2_USER_ID, date: '2026-03-01', status: 'present', method: 'qr' },
];

const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
  if (request.includes('hr.reviews.model')) {
    return {
      find(filter = {}) {
        return {
          sort() {
            return {
              lean() {
                let list = sampleReviews;
                if (filter.employeeId) {
                  list = list.filter((r) => String(r.employeeId) === String(filter.employeeId));
                }
                return Promise.resolve(list);
              },
            };
          },
        };
      },
    };
  }
  if (request.endsWith('attendance.model') || request.includes('attendance/attendance.model')) {
    return {
      find(filter = {}) {
        return {
          select() {
            return {
              lean() {
                let list = sampleAttendance;
                if (filter.$or) {
                  const targetIds = filter.$or.map((o) => String(o.user || o.studentId)).filter(Boolean);
                  list = list.filter((r) => targetIds.includes(String(r.user || r.studentId)));
                }
                return Promise.resolve(list);
              },
            };
          },
        };
      },
    };
  }
  if (request.includes('hr.profile.model')) {
    return {
      findOne({ userId } = {}) {
        return {
          populate() {
            return {
              populate() {
                return {
                  populate() {
                    return {
                      lean() {
                        if (String(userId) === T1_USER_ID) {
                          return Promise.resolve({
                            userId: T1_USER_ID,
                            department: { name: 'Technology Wing' },
                            post: { name: 'Junior Contributor' },
                            category: { name: 'Volunteer Track' },
                            joiningDate: '2026-01-15',
                          });
                        }
                        return Promise.resolve(null);
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
  }
  return origLoad.apply(this, arguments);
};

// Clear caches
delete require.cache[require.resolve('../modules/hr/hr.reviews.controller')];
delete require.cache[require.resolve('../modules/hr/hr.routes')];

const authMw = require('../modules/auth/auth.middleware');
let currentUser = null;
const origProtect = authMw.protect;
authMw.protect = (req, res, next) => {
  if (!currentUser) return res.status(401).json({ success: false, message: 'Unauthenticated' });
  req.user = currentUser;
  next();
};

const hrRouter = require('../modules/hr/hr.routes');

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
    let responseBody = null;
    const res = {
      statusCode: 200,
      status(code) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        resolve({ statusCode, body: responseBody });
        return this;
      },
    };
    hrRouter(req, res, (err) => {
      if (err) {
        resolve({ statusCode: err.statusCode || 500, body: { message: err.message } });
      } else {
        resolve({ statusCode: 404, body: { message: 'Not found' } });
      }
    });
  });
}

test('Student Self-Service Scorecard: Access control and data isolation', async (t) => {
  await t.test('Unauthenticated caller is rejected (401)', async () => {
    const res = await runRoute('GET', '/my-scorecard', { user: null });
    assert.equal(res.statusCode, 401);
  });

  await t.test('T1 volunteer can fetch their own scorecard (200)', async () => {
    const res = await runRoute('GET', '/my-scorecard', {
      user: { sub: T1_USER_ID, role: 'T1_VOLUNTEER', name: 'Alice T1' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.userId, T1_USER_ID);
    assert.equal(res.body.data.role, 'T1_VOLUNTEER');
    assert.equal(res.body.data.profile.department, 'Technology Wing');
    assert.equal(res.body.data.profile.post, 'Junior Contributor');
    assert.equal(res.body.data.profile.category, 'Volunteer Track');
    assert.equal(res.body.data.profile.joiningDate, '2026-01-15');

    // Reviews isolation: only Alice's review is returned
    assert.equal(res.body.data.reviews.length, 1);
    assert.equal(res.body.data.reviews[0].employeeId, T1_USER_ID);
    assert.equal(res.body.data.reviews[0].netScorePercentage, 90);
    assert.equal(res.body.data.reviews[0].reviewerName, 'Lead Bob');
    assert.equal(res.body.data.reviews[0].items.length, 2);

    // Attendance stats: 4 total, 2 present, 1 late, 1 absent -> (2 + 1) / 4 = 75%
    const att = res.body.data.attendanceSummary;
    assert.equal(att.totalRecords, 4);
    assert.equal(att.presentCount, 2);
    assert.equal(att.lateCount, 1);
    assert.equal(att.absentCount, 1);
    assert.equal(att.attendanceRate, 75);
  });

  await t.test('T2 associate can fetch their own scorecard (200)', async () => {
    const res = await runRoute('GET', '/my-scorecard', {
      user: { sub: T2_USER_ID, role: 'T2_ASSOCIATE', name: 'Bob T2' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.userId, T2_USER_ID);
    assert.equal(res.body.data.reviews.length, 1);
    assert.equal(res.body.data.reviews[0].employeeId, T2_USER_ID);
    assert.equal(res.body.data.reviews[0].netScorePercentage, 80);
    assert.equal(res.body.data.attendanceSummary.totalRecords, 1);
    assert.equal(res.body.data.attendanceSummary.attendanceRate, 100);
  });

  await t.test('User with no reviews or attendance gets clean empty stats (200)', async () => {
    const res = await runRoute('GET', '/my-scorecard', {
      user: { sub: OTHER_USER, role: 'T1_VOLUNTEER', name: 'New Student' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.reviews.length, 0);
    assert.equal(res.body.data.attendanceSummary.totalRecords, 0);
    assert.equal(res.body.data.attendanceSummary.attendanceRate, 100);
    assert.equal(res.body.data.profile.department, null);
  });

  // Restore
  authMw.protect = origProtect;
  Module._load = origLoad;
});
