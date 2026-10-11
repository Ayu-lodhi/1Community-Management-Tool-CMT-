const PRIVILEGED_ROLES = ['SUPER_ADMIN', 'ADMIN'];

// Match the mounted team's administrative roles and member/lead read access.
exports.canReadTeamContacts = (team, requester) => Boolean(requester?.sub && (
  PRIVILEGED_ROLES.includes(requester.role) ||
  team.leadId?.toString() === requester.sub ||
  (team.members && team.members.some(memberId => memberId.toString() === requester.sub))
));
