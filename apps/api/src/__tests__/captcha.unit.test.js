const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.ALLOW_NO_REDIS = 'true';
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';

const Captcha = require('../models/Captcha.model');
const captchaService = require('../services/captcha.service');
const verifyCaptcha = require('../middleware/verifyCaptcha');

test('Self-hosted alphanumeric SVG CAPTCHA with MongoDB TTL', async (t) => {
  const store = new Map();
  const origCreate = Captcha.create;
  const origFindOneAndDelete = Captcha.findOneAndDelete;

  beforeEach(() => {
    store.clear();

    Captcha.create = async ({ code }) => {
      const doc = {
        _id: new mongoose.Types.ObjectId().toString(),
        code,
        createdAt: new Date(),
      };
      store.set(doc._id, doc);
      return doc;
    };

    Captcha.findOneAndDelete = async (filter) => {
      const doc = store.get(String(filter._id));
      if (!doc) return null;
      if (filter.code && doc.code !== filter.code) return null;
      store.delete(String(filter._id));
      return doc;
    };
  });

  afterEach(() => {
    Captcha.create = origCreate;
    Captcha.findOneAndDelete = origFindOneAndDelete;
  });

  await t.test('generates valid 5-character unambiguous code and SVG image', () => {
    const code = captchaService.generateRandomCode(5);
    assert.strictEqual(code.length, 5);
    assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
    assert.doesNotMatch(code, /[0O1I]/, 'Must not contain ambiguous characters 0, O, 1, I');

    const svg = captchaService.generateCaptchaSvg(code);
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.endsWith('</svg>'));
    assert.ok(svg.includes(code[0]));
  });

  await t.test('createCaptchaChallenge persists to MongoDB and returns captchaId and svg', async () => {
    const challenge = await captchaService.createCaptchaChallenge();
    assert.ok(challenge.captchaId);
    assert.ok(challenge.svg.includes('<svg'));
    assert.ok(store.has(challenge.captchaId));
  });

  await t.test('verifyCaptcha middleware validates and atomically burns challenge', async () => {
    delete process.env.CAPTCHA_ENABLED;
    const challenge = await captchaService.createCaptchaChallenge();
    const storedCode = store.get(challenge.captchaId).code;

    let nextCalled = false;
    const req = {
      body: {
        captchaId: challenge.captchaId,
        captchaAnswer: storedCode.toLowerCase(), // case-insensitive match
      },
    };
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(data) { this.data = data; return this; },
    };
    const next = () => { nextCalled = true; };

    await verifyCaptcha(req, res, next);
    assert.strictEqual(nextCalled, true, 'Correct CAPTCHA answer must proceed to next()');
    assert.strictEqual(store.has(challenge.captchaId), false, 'Challenge must be deleted from DB after use');

    // Replay attack with same captchaId must fail
    nextCalled = false;
    let failStatus = 200;
    const replayRes = {
      status(code) { failStatus = code; return this; },
      json(data) { this.data = data; return this; },
    };
    await verifyCaptcha(req, replayRes, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false, 'Replaying consumed CAPTCHA must be blocked');
    assert.strictEqual(failStatus, 400);
  });

  await t.test('verifyCaptcha rejects incorrect code', async () => {
    delete process.env.CAPTCHA_ENABLED;
    const challenge = await captchaService.createCaptchaChallenge();

    let nextCalled = false;
    let statusCode = 200;
    const req = {
      body: {
        captchaId: challenge.captchaId,
        captchaAnswer: 'WRONG',
      },
    };
    const res = {
      status(code) { statusCode = code; return this; },
      json(data) { this.data = data; return this; },
    };

    await verifyCaptcha(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusCode, 400);
  });

  await t.test('verifyCaptcha allows bypass when CAPTCHA_ENABLED is false', async () => {
    process.env.CAPTCHA_ENABLED = 'false';
    let nextCalled = false;
    const req = { body: {} };
    const res = {};

    await verifyCaptcha(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, 'Must bypass when CAPTCHA_ENABLED is false');
    delete process.env.CAPTCHA_ENABLED;
  });
});
