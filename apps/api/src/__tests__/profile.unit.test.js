const test = require('node:test');
const assert = require('node:assert/strict');

const { validateLinkedInUrl } = require('../modules/profile/profile.linkedin');
const { calculateCompletion, WEIGHTS } = require('../modules/profile/profile.completion');

test('Profile Module - validateLinkedInUrl accepts valid LinkedIn profiles', () => {
  const validCases = [
    'https://www.linkedin.com/in/john-doe',
    'https://linkedin.com/in/johndoe/',
    'https://in.linkedin.com/in/student-leader-123?utm_source=share',
    '   https://www.linkedin.com/in/clean-url   ',
  ];

  for (const url of validCases) {
    const res = validateLinkedInUrl(url);
    assert.equal(res.valid, true, `Expected ${url} to be valid`);
    assert.ok(res.normalized.startsWith('https://'), 'Must be https');
    assert.ok(res.normalized.includes('/in/'), 'Must have /in/ path');
    assert.ok(!res.normalized.includes('utm_source'), 'Must strip query params');
    assert.ok(!res.normalized.endsWith('/'), 'Must strip trailing slash');
  }
});

test('Profile Module - validateLinkedInUrl rejects malicious or invalid URLs', () => {
  const invalidCases = [
    { url: 'http://www.linkedin.com/in/insecure', reason: 'Must use https' },
    { url: 'javascript:alert(1)', reason: 'Not https' },
    { url: 'https://evil.com/in/attacker', reason: 'Not linkedin.com domain' },
    { url: 'https://linkedin.com.evil.com/in/phishing', reason: 'Attacker subdomain' },
    { url: 'https://user:pass@linkedin.com/in/creds', reason: 'Credentials not allowed' },
    { url: 'https://www.linkedin.com/posts/activity', reason: 'Not an /in/ profile link' },
  ];

  for (const { url, reason } of invalidCases) {
    const res = validateLinkedInUrl(url);
    assert.equal(res.valid, false, `Expected ${url} to be invalid (${reason})`);
    assert.equal(res.normalized, null);
    assert.ok(res.reason, 'Must provide rejection reason');
  }
});

test('Profile Module - calculateCompletion weights total 100', () => {
  const total = Object.values(WEIGHTS).reduce((s, v) => s + v, 0);
  assert.equal(total, 100, 'All completion weights must sum to exactly 100');
});

test('Profile Module - calculateCompletion handles empty profile', () => {
  const result = calculateCompletion({});
  assert.equal(result.percent, 0, 'Empty profile completion must be 0%');
  assert.ok(Array.isArray(result.missing), 'Must provide list of missing items');
  assert.ok(result.missing.length > 0, 'All fields should be missing');
});

test('Profile Module - calculateCompletion handles 100% complete profile', () => {
  const fullProfile = {
    avatarKey: 'avatars/random-uuid.jpg',
    education: [{ institution: 'GEU', degree: 'B.Tech' }],
    skills: ['Node.js', 'React'],
    projects: [{ title: 'Employee Portal' }],
    bio: 'Experienced full stack developer working on high-performance web systems.',
    linkedinUrl: 'https://linkedin.com/in/developer',
    mobileVerified: true,
    emailVerified: true,
    birthday: new Date('1998-05-15'),
    city: 'Dehradun',
    university: 'Graphic Era University',
    gender: 'Male',
    headline: 'Full Stack Engineer',
    mobile: '+919876543210',
  };

  const result = calculateCompletion(fullProfile);
  assert.equal(result.percent, 100, 'Complete profile must achieve 100%');
  assert.equal(result.missing.length, 0, 'No fields should be missing');
});
