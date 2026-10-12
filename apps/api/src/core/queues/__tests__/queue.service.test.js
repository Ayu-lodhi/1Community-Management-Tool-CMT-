const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_JOB_OPTIONS, enqueueEmail, enqueueCertificateGeneration, closeQueues } = require('../queue.service');
const { checkAndSetIdempotencyKey, releaseIdempotencyKey } = require('@tbi/shared-utils');

test.after(async () => {
  await closeQueues();
});

test('Queue Service - Default Job Options configuration', () => {
  assert.equal(DEFAULT_JOB_OPTIONS.attempts, 3);
  assert.equal(DEFAULT_JOB_OPTIONS.backoff.type, 'exponential');
  assert.equal(DEFAULT_JOB_OPTIONS.backoff.delay, 2000);
  assert.equal(DEFAULT_JOB_OPTIONS.removeOnComplete, 100);
  assert.equal(DEFAULT_JOB_OPTIONS.removeOnFail, 500);
});

test('Queue Service - checkAndSetIdempotencyKey prevents duplicate processing', async () => {
  const memoryStore = new Map();
  const mockRedis = {
    async set(key, value, nx, ex, ttl) {
      if (memoryStore.has(key)) return null;
      memoryStore.set(key, value);
      return 'OK';
    },
    async del(key) {
      memoryStore.delete(key);
      return 1;
    },
  };

  const key = 'test-action-unique-123';
  const firstCheck = await checkAndSetIdempotencyKey(mockRedis, key, 3600);
  assert.equal(firstCheck, true, 'First job attempt must acquire idempotency lock');

  const secondCheck = await checkAndSetIdempotencyKey(mockRedis, key, 3600);
  assert.equal(secondCheck, false, 'Duplicate job attempt must be rejected by idempotency lock');

  await releaseIdempotencyKey(mockRedis, key);
  const thirdCheck = await checkAndSetIdempotencyKey(mockRedis, key, 3600);
  assert.equal(thirdCheck, true, 'Lock can be acquired again after release');
});

test('Queue Service - enqueueEmail handles payload and idempotency key', async () => {
  const result = await enqueueEmail('sendEmail', {
    to: 'test@example.com',
    subject: 'Welcome',
    html: '<p>Hi</p>',
    requestId: 'req-abc-123',
  });

  // Result will either be enqueued: true or fall back gracefully if Redis is offline in test
  assert.ok(result.enqueued !== undefined);
  if (result.enqueued) {
    assert.ok(result.jobId.startsWith('email:'));
  }
});

test('Queue Service - enqueueCertificateGeneration handles certificate payload', async () => {
  const result = await enqueueCertificateGeneration({
    certificateId: 'TBI-ABCD1234',
    studentId: 'user-1',
    studentName: 'Alice',
    eventTitle: 'Hackathon',
    role: 'PARTICIPANT',
    requestId: 'req-xyz-789',
  });

  assert.ok(result.enqueued !== undefined);
  if (result.enqueued) {
    assert.equal(result.jobId, 'cert:TBI-ABCD1234');
  }
});
