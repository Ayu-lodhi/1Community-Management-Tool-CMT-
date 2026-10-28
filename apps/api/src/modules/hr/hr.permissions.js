const Team = require('../teams/teams.model');

/**
 * Returns true if leadId leads any team that has targetUserId as a member.
 * Authorization is derived solely from the database — never from request body/params/query.
 */
async function isLeadOfPerson(leadId, targetUserId) {
  if (!leadId || !targetUserId) return false;
  if (leadId.toString() === targetUserId.toString()) return false;
  const team = await Team.findOne({ leadId, members: targetUserId }).lean();
  return !!team;
}

/**
 * Returns the set of User ObjectIds that are members of ALL teams led by leadId.
 * Used for list-view queries (union of all led teams). Excludes leadId itself.
 */
async function getLedMemberIds(leadId) {
  if (!leadId) return new Set();
  const leadStr = leadId.toString();
  const teams = await Team.find({ leadId }).select('members').lean();
  const ids = new Set();
  for (const t of teams) {
    for (const m of (t.members || [])) {
      const mStr = m.toString();
      if (mStr !== leadStr) {
        ids.add(mStr);
      }
    }
  }
  return ids;
}

/**
 * Returns all teams led by leadId that also contain targetUserId.
 * Used to verify an optional teamId filter belongs to the caller.
 */
async function getLedTeamsForPerson(leadId, targetUserId) {
  return Team.find({ leadId, members: targetUserId }).lean();
}

module.exports = { isLeadOfPerson, getLedMemberIds, getLedTeamsForPerson };
