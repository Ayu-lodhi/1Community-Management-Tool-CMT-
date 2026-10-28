/**
 * Integration Test Suite: Forgot Password, Reset Lifecycle & Email Fallback
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

process.env.NODE_ENV = 'test';
process.env.ALLOW_NO_REDIS = 'true';
process.env.USE_WORKER_QUEUES = 'false';

// Intercept nodemailer to capture all sent emails without network delay
const sentEmails = [];
nodemailer.createTransport = () => ({
  sendMail: async (mailOptions) => {
    sentEmails.push(mailOptions);
    return { messageId: `mock-${Date.now()}` };
  },
});
nodemailer.createTestAccount = async () => ({
  user: 'mock@ethereal.test',
  pass: 'mockpass',
});

// Load models and services BEFORE setting connection state
const User = require('../modules/admin/admin.model');
const authService = require('../modules/auth/auth.service');
const adminService = require('../modules/admin/admin.service');
const repository = require('../modules/auth/auth.repository');
const { notify } = require('../modules/notifications/notifications.service');

// Provide mock db object and readyState = 1 so ensureDbConnected() passes
mongoose.connection.db = {
  collection: () => ({
    createIndex: async () => {},
    dropIndex: async () => {},
  }),
};
Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

test('Email & Auth Flow Integration Suite', async (t) => {
  // Mock test user data
  const testUserId = new mongoose.Types.ObjectId().toString();
  const initialPasswordHash = await bcrypt.hash('OldPassword123!', 10);
  const testUser = {
    _id: testUserId,
    userId: 'TBI00088',
    name: 'Integration Test User',
    email: 'testuser@example.com',
    role: 'T1_VOLUNTEER',
    password: initialPasswordHash,
    isActive: true,
    mustChangePassword: false,
    save: async function () { return this; },
    toObject: function () { return { ...this }; },
  };

  await t.test('1. forgotPassword: sends reset link email for valid registered user', async () => {
    sentEmails.length = 0;
    const origFindByEmail = repository.findByEmail;
    const origFindById = User.findById;

    repository.findByEmail = async (email) => {
      if (email === 'testuser@example.com') return { ...testUser };
      return null;
    };

    User.findById = (id) => ({
      select: () => ({
        ...testUser,
        save: async function () { return this; },
        toObject: function () { return { ...this }; },
      }),
    });

    try {
      const res = await authService.forgotPassword('testuser@example.com');
      assert.equal(res.success, true);
      assert.equal(sentEmails.length, 1, 'One reset email should have been sent');
      assert.equal(sentEmails[0].to, 'testuser@example.com');
      assert.match(sentEmails[0].subject, /Password Reset Link/);
      assert.match(sentEmails[0].html, /reset-password\?token=/);
    } finally {
      repository.findByEmail = origFindByEmail;
      User.findById = origFindById;
    }
  });

  await t.test('2. forgotPassword: anti-enumeration hides whether unregistered email exists', async () => {
    sentEmails.length = 0;
    const origFindByEmail = repository.findByEmail;
    repository.findByEmail = async () => null;

    try {
      const res = await authService.forgotPassword('nonexistent@example.com');
      assert.equal(res.success, true, 'Must return success to prevent user enumeration');
      assert.equal(sentEmails.length, 0, 'No email should be sent for non-existent account');
    } finally {
      repository.findByEmail = origFindByEmail;
    }
  });

  await t.test('3. forgotPassword: rejects malformed email input with validation error', async () => {
    await assert.rejects(
      async () => {
        await authService.forgotPassword('invalid-email-string');
      },
      /valid email/
    );
  });

  await t.test('4. completePasswordReset: consumes token and sends confirmation alert email', async () => {
    sentEmails.length = 0;
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const resetUserDoc = {
      ...testUser,
      passwordResetToken: tokenHash,
      passwordResetExpiry: new Date(Date.now() + 3600000), // 1 hour ahead
      save: async function () { return this; },
      toObject: function () { return { ...this }; },
    };

    const origFindById = User.findById;
    User.findById = (id) => ({
      select: () => ({ ...resetUserDoc }),
    });

    try {
      const res = await adminService.completePasswordReset(testUserId, rawToken, 'BrandNewPassword123!');
      assert.equal(res.user._id, testUserId);

      // Verify that security confirmation email was delivered
      assert.ok(sentEmails.length >= 1, 'Password changed security email must be sent');
      const confirmEmail = sentEmails.find((e) => e.to === 'testuser@example.com');
      assert.ok(confirmEmail, 'Recipient must be the account owner');
      assert.match(confirmEmail.subject, /Security Alert.*Password/);
    } finally {
      User.findById = origFindById;
    }
  });

  await t.test('5. notifications: notify falls back to direct SES email when Redis queue is disabled', async () => {
    sentEmails.length = 0;
    const origFindById = User.findById;

    User.findById = (id) => ({
      select: () => Promise.resolve({
        email: 'volunteer@tbi.test',
        phone: '+919999999999',
        notificationPrefs: { email: true, inApp: false },
      }),
    });

    try {
      await notify('507f1f77bcf86cd799439099', 'application', 'Leave Request Approved', 'Your leave for tomorrow has been approved.');
      assert.equal(sentEmails.length, 1, 'Notification email must be dispatched directly');
      assert.equal(sentEmails[0].to, 'volunteer@tbi.test');
      assert.equal(sentEmails[0].subject, 'Leave Request Approved');
    } finally {
      User.findById = origFindById;
    }
  });
});
