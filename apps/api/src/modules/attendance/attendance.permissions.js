const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  T3_EXECUTIVE: 'T3_EXECUTIVE',
  T2_ASSOCIATE: 'T2_ASSOCIATE',
  T1_VOLUNTEER: 'T1_VOLUNTEER',
};
const PRIVILEGED_ROLES = ['SUPER_ADMIN', 'ADMIN'];
const { AuthorizationError } = require('../../core/errors/typedErrors');

exports.assertTeamAttendanceAccess = (team, requester) => {
  if (requester?.sub && PRIVILEGED_ROLES.includes(requester.role)) return;

  // Match /teams/me: T3 may read teams they lead or belong to.
  if (requester?.sub && requester.role === ROLES.T3_EXECUTIVE) {
    const isLead = team.leadId?.toString() === requester.sub;
    const isMember = team.members && team.members.some((member) => member.toString() === requester.sub);
    if (isLead || isMember) return;
  }
  throw new AuthorizationError('Not authorized to read this team attendance');
};
