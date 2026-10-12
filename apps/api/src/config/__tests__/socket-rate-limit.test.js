const test = require('node:test');
const assert = require('node:assert/strict');
const { checkSocketRateLimit, SOCKET_EVENT_LIMIT } = require('../socket');

test('Socket.io Rate Limit - allows requests up to limit and blocks subsequent bursts', async () => {
  const userId = 'socket-test-user-limit-check';

  // Consume allowed limit
  for (let i = 0; i < SOCKET_EVENT_LIMIT; i++) {
    const allowed = await checkSocketRateLimit(userId);
    assert.equal(allowed, true, `Event ${i + 1} should be allowed`);
  }

  // Next event should exceed the rate limit
  const exceeded = await checkSocketRateLimit(userId);
  assert.equal(exceeded, false, 'Event exceeding limit must be blocked');
});
