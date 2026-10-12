const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canViewProfile,
  sanitizeProfileForViewer,
  canChangeTier,
} = require('../modules/profile/profile.access');

// Mock test actors
const actors = {
  superAdmin: { _id: '507f1f77bcf86cd799439011', role: 'SUPER_ADMIN', name: 'Super Admin' },
  admin: { _id: '507f1f77bcf86cd799439012', role: 'ADMIN', name: 'Admin One' },
  otherAdmin: { _id: '507f1f77bcf86cd799439013', role: 'ADMIN', name: 'Admin Two' },
  t3Exec: { _id: '507f1f77bcf86cd799439014', role: 'T3_EXECUTIVE', name: 'T3 Leader' },
  teamMemberM1: { _id: '507f1f77bcf86cd799439015', role: 'STUDENT', name: 'Member 1' },
  teamMemberM2: { _id: '507f1f77bcf86cd799439016', role: 'STUDENT', name: 'Member 2' },
  nonMemberUserN: { _id: '507f1f77bcf86cd799439017', role: 'STUDENT', name: 'Non Member' },
  userA: { _id: '507f1f77bcf86cd799439018', role: 'EMPLOYEE', name: 'User A' },
  userB: { _id: '507f1f77bcf86cd799439019', role: 'EMPLOYEE', name: 'User B' },
};

const t3LedMembers = [actors.teamMemberM1._id, actors.teamMemberM2._id];

test('Profile Access - canViewProfile authorization matrix', () => {
  // 1. Unauthenticated or missing
  assert.equal(canViewProfile(null, actors.userA).allowed, false);
  assert.equal(canViewProfile(actors.userA, null).allowed, false);

  // 2. Owner viewing own profile
  const ownCheck = canViewProfile(actors.userA, actors.userA);
  assert.equal(ownCheck.allowed, true);
  assert.equal(ownCheck.scope, 'owner');

  // 3. Normal user viewing another normal user
  const idorCheck = canViewProfile(actors.userA, actors.userB);
  assert.equal(idorCheck.allowed, false);

  // 4. Super Admin viewing any profile
  const saCheck1 = canViewProfile(actors.superAdmin, actors.userA);
  assert.equal(saCheck1.allowed, true);
  assert.equal(saCheck1.scope, 'admin');

  // 5. Admin viewing any profile
  const adminCheck1 = canViewProfile(actors.admin, actors.userA);
  assert.equal(adminCheck1.allowed, true);
  assert.equal(adminCheck1.scope, 'admin');

  // 6. T3 Executive viewing team member
  const t3MemberCheck = canViewProfile(actors.t3Exec, actors.teamMemberM1, t3LedMembers);
  assert.equal(t3MemberCheck.allowed, true);
  assert.equal(t3MemberCheck.scope, 't3_team');

  // 7. T3 Executive viewing non-member
  const t3NonMemberCheck = canViewProfile(actors.t3Exec, actors.nonMemberUserN, t3LedMembers);
  assert.equal(t3NonMemberCheck.allowed, false);

  // 8. T3 Executive viewing Admin
  const t3AdminCheck = canViewProfile(actors.t3Exec, actors.admin, t3LedMembers);
  assert.equal(t3AdminCheck.allowed, false);
});

test('Profile Access - sanitizeProfileForViewer field-level privacy', () => {
  const fullProfile = {
    headline: 'MCA Student',
    university: 'GEU',
    city: 'Dehradun',
    mobile: '+919876543210',
    email: 'student@geu.ac.in',
    birthday: new Date('2000-01-01'),
    skills: ['React', 'Node.js'],
    mobileVerified: true,
    emailVerified: true,
  };

  // Owner sees everything
  const ownerData = sanitizeProfileForViewer(fullProfile, 'owner');
  assert.equal(ownerData.mobile, '+919876543210');
  assert.ok(ownerData.birthday);
  assert.equal(ownerData.email, 'student@geu.ac.in');

  // Admin sees everything
  const adminData = sanitizeProfileForViewer(fullProfile, 'admin');
  assert.equal(adminData.mobile, '+919876543210');
  assert.ok(adminData.birthday);
  assert.equal(adminData.email, 'student@geu.ac.in');

  // T3 Team view redacts mobile, birthday, and email
  const teamData = sanitizeProfileForViewer(fullProfile, 't3_team');
  assert.equal(teamData.headline, 'MCA Student');
  assert.equal(teamData.university, 'GEU');
  assert.equal(teamData.mobile, undefined, 'Mobile must be stripped for team view');
  assert.equal(teamData.birthday, undefined, 'Birthday must be stripped for team view');
  assert.equal(teamData.email, undefined, 'Email must be stripped for team view');
});

test('Profile Access - canChangeTier privilege escalation and rules', () => {
  // 1. Unauthenticated or normal user cannot change tier
  assert.equal(canChangeTier(null, actors.teamMemberM1, 'T1').statusCode, 401);
  assert.equal(canChangeTier(actors.userA, actors.teamMemberM1, 'T1').statusCode, 403);
  assert.equal(canChangeTier(actors.t3Exec, actors.teamMemberM1, 'T1').statusCode, 403);

  // 2. Admin changing normal user tier
  const adminPromote = canChangeTier(actors.admin, actors.teamMemberM1, 'T2');
  assert.equal(adminPromote.allowed, true);
  assert.equal(adminPromote.statusCode, 200);

  // 3. Admin cannot change their own tier
  const adminSelf = canChangeTier(actors.admin, actors.admin, 'T3');
  assert.equal(adminSelf.allowed, false);
  assert.equal(adminSelf.statusCode, 403);

  // 4. Admin cannot change another Admin
  const adminOther = canChangeTier(actors.admin, actors.otherAdmin, 'T1');
  assert.equal(adminOther.allowed, false);
  assert.equal(adminOther.statusCode, 403);

  // 5. Admin cannot change Super Admin
  const adminSA = canChangeTier(actors.admin, actors.superAdmin, 'T1');
  assert.equal(adminSA.allowed, false);
  assert.equal(adminSA.statusCode, 403);

  // 6. Super Admin can change Admin tier
  const saAdmin = canChangeTier(actors.superAdmin, actors.admin, 'T3');
  assert.equal(saAdmin.allowed, true);
  assert.equal(saAdmin.statusCode, 200);

  // 7. Invalid tier values are rejected with 400
  const invalidCases = ['T4', 'admin', 'SUPER_ADMIN', '', null, undefined, 123];
  for (const tier of invalidCases) {
    const res = canChangeTier(actors.superAdmin, actors.teamMemberM1, tier);
    assert.equal(res.allowed, false);
    assert.equal(res.statusCode, 400, `Expected 400 for tier value: ${tier}`);
  }
});
