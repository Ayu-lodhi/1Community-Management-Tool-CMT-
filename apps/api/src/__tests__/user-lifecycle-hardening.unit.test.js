const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test_access_jwt_secret_min_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'test_refresh_jwt_secret_min_32_characters_long';

const User = require('../modules/admin/admin.model');
const Team = require('../modules/teams/teams.model');
const Profile = require('../modules/profile/profile.model');
const Notification = require('../modules/notifications/notifications.model');
const ChatRoom = require('../modules/chat/chatRoom.model');
const Event = require('../modules/events/events.model');
const Attendance = require('../modules/attendance/attendance.model');
const ShiftAssignment = require('../models/ShiftAssignment.model');
const Certificate = require('../modules/certificates/certificates.model');
const Review = require('../modules/reviews/reviews.model');

const adminService = require('../modules/admin/admin.service');
const profileService = require('../modules/profile/profile.service');

test('User Lifecycle Hardening - Attendance progress matches lowercase and uppercase present', async (t) => {
  let queryCaptured = null;
  const origAttendanceCount = Attendance.countDocuments;
  const origEventCount = Event.countDocuments;
  const origTeamCount = Team.countDocuments;
  const origCertCount = Certificate.countDocuments;
  const origReviewFind = Review.find;

  Attendance.countDocuments = async (query) => {
    queryCaptured = query;
    return 15;
  };
  Event.countDocuments = async () => 3;
  Team.countDocuments = async () => 1;
  Certificate.countDocuments = async () => 1;
  Review.find = () => ({
    select: async () => [{ rating: 5 }]
  });

  t.after(() => {
    Attendance.countDocuments = origAttendanceCount;
    Event.countDocuments = origEventCount;
    Team.countDocuments = origTeamCount;
    Certificate.countDocuments = origCertCount;
    Review.find = origReviewFind;
  });

  const progress = await profileService.getUserProgress('507f1f77bcf86cd799439011');
  assert.ok(queryCaptured, 'Attendance.countDocuments should have been queried');
  assert.deepEqual(queryCaptured.status, { $in: ['present', 'PRESENT'] }, 'Query should match both lowercase and uppercase present');
  assert.ok(queryCaptured.$or, 'Query should use $or for studentId and user');
  assert.ok(progress.score > 0, 'Progress score should reflect attended count');
});

test('User Lifecycle Hardening - deleteUser guards & cascading cleanup', async (t) => {
  const origFindById = User.findById;
  const origFindByIdAndDelete = User.findByIdAndDelete;
  const origTeamFindOne = Team.findOne;
  const origTeamUpdateMany = Team.updateMany;
  const origProfileDeleteOne = Profile.deleteOne;
  const origNotificationDeleteMany = Notification.deleteMany;
  const origChatRoomUpdateMany = ChatRoom.updateMany;
  const origEventUpdateMany = Event.updateMany;
  const origShiftDeleteMany = ShiftAssignment.deleteMany;

  t.after(() => {
    User.findById = origFindById;
    User.findByIdAndDelete = origFindByIdAndDelete;
    Team.findOne = origTeamFindOne;
    Team.updateMany = origTeamUpdateMany;
    Profile.deleteOne = origProfileDeleteOne;
    Notification.deleteMany = origNotificationDeleteMany;
    ChatRoom.updateMany = origChatRoomUpdateMany;
    Event.updateMany = origEventUpdateMany;
    ShiftAssignment.deleteMany = origShiftDeleteMany;
  });

  const userId = '507f1f77bcf86cd799439099';
  const adminId = '507f1f77bcf86cd799439001';

  // 1. Guard against deleting self
  User.findById = async (id) => ({ _id: id, role: 'ADMIN', isActive: false });
  await assert.rejects(
    async () => adminService.deleteUser(adminId, adminId),
    /cannot delete your own account/i
  );

  // 2. Guard against deleting active user (must revoke first)
  User.findById = async () => ({ _id: userId, role: 'T1_VOLUNTEER', isActive: true });
  await assert.rejects(
    async () => adminService.deleteUser(userId, adminId),
    /must be revoked before deletion/i
  );

  // 3. Guard against deleting a team lead
  User.findById = async () => ({ _id: userId, role: 'T3_EXECUTIVE', isActive: false });
  Team.findOne = async () => ({ _id: 'team123', name: 'Alpha Team', leadId: userId });
  await assert.rejects(
    async () => adminService.deleteUser(userId, adminId),
    /designated as lead for team/i
  );

  // 4. Successful cascading delete
  Team.findOne = async () => null;
  let profileDeleted = false;
  let notifsDeleted = false;
  let teamPulled = false;
  let chatPulled = false;
  let eventPulled = false;
  let shiftsDeleted = false;
  let userDeleted = false;

  Profile.deleteOne = async (q) => { if (q.user === userId) profileDeleted = true; return {}; };
  Notification.deleteMany = async (q) => { if (q.userId === userId) notifsDeleted = true; return {}; };
  Team.updateMany = async (q, u) => { if (q.members === userId) teamPulled = true; return {}; };
  ChatRoom.updateMany = async (q, u) => { if (q.participants === userId) chatPulled = true; return {}; };
  Event.updateMany = async (q, u) => { if (q['members.userId'] === userId) eventPulled = true; return {}; };
  ShiftAssignment.deleteMany = async (q) => { if (q.userId === userId) shiftsDeleted = true; return {}; };
  User.findByIdAndDelete = async (id) => { if (id === userId) userDeleted = true; return {}; };

  const result = await adminService.deleteUser(userId, adminId);
  assert.ok(result);
  assert.equal(profileDeleted, true, 'Profile document should be deleted');
  assert.equal(notifsDeleted, true, 'Notifications should be deleted');
  assert.equal(teamPulled, true, 'User should be pulled from Team.members');
  assert.equal(chatPulled, true, 'User should be pulled from ChatRoom.participants');
  assert.equal(eventPulled, true, 'User should be pulled from Event.members');
  assert.equal(shiftsDeleted, true, 'Future shift assignments should be purged');
  assert.equal(userDeleted, true, 'User document should be deleted');
});

test('User Lifecycle Hardening - updateUserRole guards last Super Admin & demotion unassigns team lead', async (t) => {
  const origFindById = User.findById;
  const origCount = User.countDocuments;
  const origTeamFindOne = Team.findOne;
  const origTeamUpdateOne = Team.updateOne;

  t.after(() => {
    User.findById = origFindById;
    User.countDocuments = origCount;
    Team.findOne = origTeamFindOne;
    Team.updateOne = origTeamUpdateOne;
  });

  const saId = '507f1f77bcf86cd799439001';
  const superAdminCaller = { sub: saId, role: 'SUPER_ADMIN' };

  // 1. Guard against demoting the last Super Admin
  User.findById = async () => ({ _id: saId, role: 'SUPER_ADMIN', save: async () => {} });
  User.countDocuments = async () => 1;

  await assert.rejects(
    async () => adminService.updateUserRole(saId, 'ADMIN', superAdminCaller),
    /cannot demote the last super admin/i
  );

  // 2. Demoting T3_EXECUTIVE to T1_VOLUNTEER unassigns team lead
  const t3Id = '507f1f77bcf86cd799439002';
  User.findById = async () => ({
    _id: t3Id,
    role: 'T3_EXECUTIVE',
    save: async function() { this.role = 'T1_VOLUNTEER'; }
  });

  let teamLeadUnassigned = false;
  Team.findOne = async () => ({ _id: 'team456', leadId: t3Id });
  Team.updateOne = async (filter, update) => {
    if (filter._id === 'team456' && update.$set?.leadId === null) {
      teamLeadUnassigned = true;
    }
    return {};
  };

  const roleRes = await adminService.updateUserRole(t3Id, 'T1_VOLUNTEER', superAdminCaller, '127.0.0.1', 'Demoted for testing');
  assert.equal(roleRes.newRole, 'T1_VOLUNTEER');
  assert.equal(teamLeadUnassigned, true, 'Team lead should be unassigned when demoting T3');
});
