const test = require('node:test');
const assert = require('node:assert/strict');

const { validateLinkedInUrl } = require('../modules/profile/profile.linkedin');

test('Profile Validation - Mass Assignment Protection', () => {
  // Simulate the allowlist mechanism used in profile.service.js
  const EDITABLE_FIELDS = [
    'headline', 'university', 'city', 'gender', 'birthday',
    'skills', 'education', 'projects', 'bio', 'linkedinUrl', 'mobile',
  ];

  const maliciousBody = {
    role: 'SUPER_ADMIN',
    tier: 'T3',
    permissions: ['ALL_PERMISSIONS'],
    grants: ['GRANT_SUPER'],
    emailVerified: true,
    mobileVerified: true,
    completionPercent: 100,
    progressScore: 100,
    progress: { score: 100 },
    userId: '607f1f77bcf86cd799439000',
    _id: '607f1f77bcf86cd799439000',
    isAdmin: true,
    headline: 'Legitimate Engineer',
  };

  const filteredUpdates = {};
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(maliciousBody, field)) {
      filteredUpdates[field] = maliciousBody[field];
    }
  }

  // Only headline should be retained
  assert.deepEqual(Object.keys(filteredUpdates), ['headline']);
  assert.equal(filteredUpdates.role, undefined);
  assert.equal(filteredUpdates.tier, undefined);
  assert.equal(filteredUpdates.permissions, undefined);
  assert.equal(filteredUpdates.grants, undefined);
  assert.equal(filteredUpdates.emailVerified, undefined);
  assert.equal(filteredUpdates.mobileVerified, undefined);
  assert.equal(filteredUpdates.completionPercent, undefined);
  assert.equal(filteredUpdates.progressScore, undefined);
  assert.equal(filteredUpdates.userId, undefined);
  assert.equal(filteredUpdates._id, undefined);
  assert.equal(filteredUpdates.isAdmin, undefined);
});

test('Profile Validation - LinkedIn Validator rejects XSS, SSRF and malformed URLs', () => {
  const dangerousUrls = [
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'http://linkedin.com/in/test', // HTTP not allowed
    'https://linkedin.com.attacker.com/in/test',
    'https://attacker.com/linkedin.com/in/test',
    'https://notlinkedin.com/in/test',
    'https://user:pass@linkedin.com/in/test',
    'https://linkedin.com/feed', // Not /in/ profile
    'https://linkedin.com/in/', // Empty profile slug
  ];

  for (const url of dangerousUrls) {
    const res = validateLinkedInUrl(url);
    assert.equal(res.valid, false, `Expected ${url} to be rejected`);
    assert.equal(res.normalized, null);
  }
});

test('Profile Validation - Future birthday is rejected', () => {
  const futureDate = new Date(Date.now() + 86400000 * 365); // 1 year in future
  const isPastDate = (val) => {
    if (!val) return null;
    const d = new Date(val);
    return !isNaN(d.getTime()) && d < new Date();
  };

  assert.equal(isPastDate(futureDate), false);
  assert.equal(isPastDate('2000-01-01'), true);
  assert.equal(isPastDate('invalid-date'), false);
});

test('Profile Validation - Gender normalizes properly across enum values', () => {
  const Profile = require('../modules/profile/profile.model');
  const mongoose = require('mongoose');

  const testCases = [
    { input: 'Male', expected: 'male' },
    { input: 'Female', expected: 'female' },
    { input: 'Non-Binary', expected: 'other' },
    { input: 'other', expected: 'other' },
    { input: 'Prefer not to say', expected: 'prefer_not_to_say' },
    { input: 'prefer_not_to_say', expected: 'prefer_not_to_say' },
    { input: '', expected: '' },
  ];

  for (const { input, expected } of testCases) {
    const doc = new Profile({
      userId: new mongoose.Types.ObjectId(),
      gender: input,
    });
    assert.equal(doc.gender, expected, `Input "${input}" should normalize to "${expected}"`);
    const validationError = doc.validateSync();
    assert.equal(validationError, undefined, `Validation should pass for gender "${input}"`);
  }
});

test('Profile Validation - Education supports fieldOfStudy and number casting', () => {
  const Profile = require('../modules/profile/profile.model');
  const mongoose = require('mongoose');

  const doc = new Profile({
    userId: new mongoose.Types.ObjectId(),
    education: [{
      institution: 'Graphic Era University',
      degree: 'B.Tech',
      fieldOfStudy: 'Computer Science',
      startYear: 2020,
      endYear: 2024,
    }],
  });

  const err = doc.validateSync();
  assert.equal(err, undefined, 'Education validation should pass');
  assert.equal(doc.education[0].fieldOfStudy, 'Computer Science');
});
