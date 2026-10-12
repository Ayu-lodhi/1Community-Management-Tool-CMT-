const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';

const { enqueueEmail, emailQueue, closeQueues } = require('../core/queues/queue.service');
const { logger } = require('../core/utils/logger');

if (emailQueue) {
  emailQueue.on('error', () => {});
}

test('Phase 6 - enqueueEmail redacts recipient email and does not log tokens/OTPs', async (t) => {
  const loggedEntries = [];

  const origInfo = logger.info;
  const origWarn = logger.warn;

  logger.info = (msg, meta) => {
    loggedEntries.push({ level: 'info', msg, meta });
    origInfo(msg, meta);
  };
  logger.warn = (msg, meta) => {
    loggedEntries.push({ level: 'warn', msg, meta });
    origWarn(msg, meta);
  };

  const sensitiveEmail = 'confidential.officer@domain.com';
  const sensitiveToken = 'super_secret_jwt_token_payload_xyz';
  const sensitiveOtp = '987654';

  try {
    await enqueueEmail('sendEmail', {
      to: sensitiveEmail,
      subject: 'Security Alert',
      html: '<p>Your reset link</p>',
      token: sensitiveToken,
      otp: sensitiveOtp,
      requestId: 'req-test-123',
    });

    assert.ok(loggedEntries.length > 0, 'At least one log entry must have been created');

    for (const entry of loggedEntries) {
      const serialized = JSON.stringify(entry);

      // Must NOT contain raw email
      assert.equal(
        serialized.includes(sensitiveEmail),
        false,
        `Log entry must NOT contain full email: ${sensitiveEmail}`
      );

      // Must NOT contain token or OTP
      assert.equal(
        serialized.includes(sensitiveToken),
        false,
        `Log entry must NOT contain sensitive token: ${sensitiveToken}`
      );
      assert.equal(
        serialized.includes(sensitiveOtp),
        false,
        `Log entry must NOT contain sensitive OTP: ${sensitiveOtp}`
      );

      // If 'to' field exists in meta, it must be masked
      if (entry.meta && entry.meta.to) {
        assert.equal(entry.meta.to, 'c***@domain.com', 'Recipient email must be properly masked');
      }
    }
  } finally {
    logger.info = origInfo;
    logger.warn = origWarn;
  }
});

test('Phase 6 - enqueueEmail redacts recipient email even on enqueue failure/fallback', async (t) => {
  const loggedWarns = [];
  const origWarn = logger.warn;
  logger.warn = (msg, meta) => {
    loggedWarns.push({ msg, meta });
    origWarn(msg, meta);
  };

  const sensitiveEmail = 'fallback.user@example.org';

  // Force emailQueue.add to fail to test fallback logging
  let origAdd = null;
  if (emailQueue) {
    origAdd = emailQueue.add;
    emailQueue.add = async () => {
      throw new Error('Simulated Redis timeout');
    };
  }

  try {
    const result = await enqueueEmail('sendEmail', {
      to: sensitiveEmail,
      subject: 'Welcome',
    });

    assert.equal(result.enqueued, false);
    assert.ok(loggedWarns.length > 0, 'Fallback warn log must be triggered');

    for (const warn of loggedWarns) {
      const serialized = JSON.stringify(warn);
      assert.equal(
        serialized.includes(sensitiveEmail),
        false,
        'Fallback log must NOT contain full email'
      );
      if (warn.meta && warn.meta.to) {
        assert.equal(warn.meta.to, 'f***@example.org', 'Fallback log must mask recipient email');
      }
    }
  } finally {
    logger.warn = origWarn;
    if (emailQueue && origAdd) {
      emailQueue.add = origAdd;
    }
  }
});
