const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.ALLOW_NO_REDIS = 'true';
process.env.USE_WORKER_QUEUES = 'false';
process.env.REDIS_CACHE_URL = 'redis://localhost:6379/0';
process.env.REDIS_PUBSUB_URL = 'redis://localhost:6379/1';
process.env.REDIS_QUEUE_URL = 'redis://localhost:6379/2';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';

const origEnv = { ...process.env };
const nodemailer = require('nodemailer');
const emailService = require('../services/email.service');
const adminService = require('../modules/admin/admin.service');
const User = require('../modules/admin/admin.model');

test('Email service production configuration & emailSent reporting', async (t) => {
  const origCreate = User.create;
  const origFindOne = User.findOne;
  const origCreateTransport = nodemailer.createTransport;
  const origCreateTestAccount = nodemailer.createTestAccount;

  beforeEach(() => {
    emailService._resetTransporter();
    delete process.env.EMAIL_HOST;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
    delete process.env.AWS_REGION;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
  });

  afterEach(() => {
    emailService._resetTransporter();
    User.create = origCreate;
    User.findOne = origFindOne;
    nodemailer.createTransport = origCreateTransport;
    nodemailer.createTestAccount = origCreateTestAccount;
    Object.keys(process.env).forEach((k) => delete process.env[k]);
    Object.assign(process.env, origEnv);
  });

  await t.test('production without SMTP returns emailSent false and no password in response', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.EMAIL_HOST;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
    delete process.env.AWS_REGION;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;

    User.findOne = async () => null;
    User.create = async (doc) => ({
      ...doc,
      _id: '507f1f77bcf86cd799439011',
      toObject: () => ({ ...doc, _id: '507f1f77bcf86cd799439011' }),
    });

    const result = await adminService.createUser({
      name: 'Test Prod User',
      email: 'testprod@example.com',
      role: 'T1_VOLUNTEER',
    }, 'SUPER_ADMIN');

    assert.strictEqual(result.emailSent, false, 'emailSent must be false when SMTP is missing in production');
    assert.strictEqual(result.user.password, undefined, 'password must not be in user object');
  });

  await t.test('with SMTP configured (mock transport) returns emailSent true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_HOST = 'smtp.test.com';
    process.env.EMAIL_USER = 'testuser';
    process.env.EMAIL_PASS = 'testpass';

    nodemailer.createTransport = () => ({
      sendMail: async () => ({ messageId: '<test-message-id@domain>' }),
    });

    User.findOne = async () => null;
    User.create = async (doc) => ({
      ...doc,
      _id: '507f1f77bcf86cd799439012',
      toObject: () => ({ ...doc, _id: '507f1f77bcf86cd799439012' }),
    });

    const result = await adminService.createUser({
      name: 'Test SMTP User',
      email: 'testsmtp@example.com',
      role: 'T1_VOLUNTEER',
    }, 'SUPER_ADMIN');

    assert.strictEqual(result.emailSent, true, 'emailSent must be true when SMTP sends successfully');
    assert.strictEqual(result.user.password, undefined, 'password must not be in user object');
  });

  await t.test('with AWS SES IAM credentials configured (mock transport) returns emailSent true in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.EMAIL_HOST;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
    process.env.AWS_REGION = 'ap-south-1';
    process.env.AWS_ACCESS_KEY_ID = 'AKIA_MOCK_SES_KEY';
    process.env.AWS_SECRET_ACCESS_KEY = 'mock_secret_key_that_is_40_chars_long!!';

    nodemailer.createTransport = () => ({
      sendMail: async () => ({ messageId: '<test-ses-message-id@domain>' }),
    });

    User.findOne = async () => null;
    User.create = async (doc) => ({
      ...doc,
      _id: '507f1f77bcf86cd799439014',
      toObject: () => ({ ...doc, _id: '507f1f77bcf86cd799439014' }),
    });

    const result = await adminService.createUser({
      name: 'Test SES User',
      email: 'testses@example.com',
      role: 'T1_VOLUNTEER',
    }, 'SUPER_ADMIN');

    assert.strictEqual(result.emailSent, true, 'emailSent must be true when AWS SES sends successfully');
    assert.strictEqual(result.user.password, undefined, 'password must not be in user object');
  });

  await t.test('development mode with mocked ethereal still works', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.EMAIL_HOST;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;

    nodemailer.createTestAccount = async () => ({ user: 'ethereal@test.com', pass: 'secret' });
    nodemailer.createTransport = () => ({
      sendMail: async () => ({ messageId: '<ethereal-message-id@ethereal.email>' }),
    });

    User.findOne = async () => null;
    User.create = async (doc) => ({
      ...doc,
      _id: '507f1f77bcf86cd799439013',
      toObject: () => ({ ...doc, _id: '507f1f77bcf86cd799439013' }),
    });

    const result = await adminService.createUser({
      name: 'Test Dev User',
      email: 'testdev@example.com',
      role: 'T1_VOLUNTEER',
    }, 'SUPER_ADMIN');

    assert.strictEqual(result.emailSent, true, 'emailSent must be true in development with ethereal');
  });
});
