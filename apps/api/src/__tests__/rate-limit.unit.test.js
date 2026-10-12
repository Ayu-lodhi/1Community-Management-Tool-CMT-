const { test } = require('node:test');
const assert = require('node:assert');
const { attendanceGenerateLimiter, _inMemoryAttendanceGenRequests } = require('../middleware/rateLimit.middleware');

test('Attendance generate limiter pruning', (t) => {
  const req = { user: { sub: 'test-user-1' } };
  let status, body;
  const res = {
    status: (s) => { status = s; return { json: (b) => { body = b; } }; },
    setHeader: () => {}
  };
  
  attendanceGenerateLimiter(req, res, () => {});
  assert.strictEqual(_inMemoryAttendanceGenRequests.size > 0, true);
});
