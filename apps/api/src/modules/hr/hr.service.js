const HrPerformanceFactor = require('../../models/hr_PerformanceFactor.model');
const HrPerformanceReview = require('../../models/hr_PerformanceReview.model');
const HrIncidentReport = require('../../models/hr_IncidentReport.model');
const HrAttendancePolicy = require('../../models/hr_AttendancePolicy.model');
const DailyAttendance = require('../../models/DailyAttendance.model');
const User = require('../admin/admin.model');
const Team = require('../teams/teams.model');
const {
  calculatePenaltyDays,
  calculateNetAttendedDays,
  calculatePerformanceScore,
  sanitizeCsvCell,
} = require('../../core/utils/attendanceCalculations');
const { recordPermissionAudit } = require('../../core/utils/auditLogger');

class HrService {
  // --- 1. PERFORMANCE FACTORS (MASTER DATA) ---

  async createFactor({ name, benchmarkScore = 10, weight = 1, description = '', actor, ip = null }) {
    const factor = await HrPerformanceFactor.create({
      name,
      benchmarkScore,
      weight,
      description,
    });

    await recordPermissionAudit({
      performedBy: actor?.sub || actor?._id,
      performedByName: actor?.name || 'Administrator',
      targetId: factor._id,
      targetType: 'HrPerformanceFactor',
      action: 'HR_FACTOR_CREATED',
      oldValue: null,
      newValue: { name, benchmarkScore, weight },
      ipAddress: ip,
    });

    return factor;
  }

  async listFactors({ activeOnly = true } = {}) {
    const filter = activeOnly ? { isActive: true } : {};
    return HrPerformanceFactor.find(filter).sort({ weight: -1, name: 1 });
  }

  async updateFactor({ factorId, updates, actor, ip = null }) {
    const old = await HrPerformanceFactor.findById(factorId);
    if (!old) throw new Error('Performance factor not found');

    const factor = await HrPerformanceFactor.findByIdAndUpdate(
      factorId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    await recordPermissionAudit({
      performedBy: actor?.sub || actor?._id,
      performedByName: actor?.name || 'Administrator',
      targetId: factor._id,
      targetType: 'HrPerformanceFactor',
      action: 'HR_FACTOR_UPDATED',
      oldValue: { name: old.name, benchmarkScore: old.benchmarkScore, weight: old.weight },
      newValue: updates,
      ipAddress: ip,
    });

    return factor;
  }

  async deleteFactor({ factorId, actor, ip = null }) {
    const factor = await HrPerformanceFactor.findByIdAndUpdate(factorId, { isActive: false }, { new: true });
    if (!factor) throw new Error('Performance factor not found');

    await recordPermissionAudit({
      performedBy: actor?.sub || actor?._id,
      performedByName: actor?.name || 'Administrator',
      targetId: factor._id,
      targetType: 'HrPerformanceFactor',
      action: 'HR_FACTOR_DEACTIVATED',
      oldValue: { name: factor.name, isActive: true },
      newValue: { isActive: false },
      ipAddress: ip,
    });

    return factor;
  }

  // --- 2. ATTENDANCE POLICY (MASTER DATA) ---

  async getAttendancePolicy() {
    let policy = await HrAttendancePolicy.findOne({ key: 'GLOBAL' });
    if (!policy) {
      policy = await HrAttendancePolicy.create({ key: 'GLOBAL' });
    }
    return policy;
  }

  async updateAttendancePolicy({ updates, actor, ip = null }) {
    const allowed = [
      'lateComingThreshold',
      'lateComingPenaltyDays',
      'earlyGoingThreshold',
      'earlyGoingPenaltyDays',
      'gracePeriodMinutes',
    ];

    const cleanUpdates = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        cleanUpdates[key] = updates[key];
      }
    }

    const oldPolicy = await this.getAttendancePolicy();

    const policy = await HrAttendancePolicy.findOneAndUpdate(
      { key: 'GLOBAL' },
      { $set: cleanUpdates },
      { upsert: true, new: true, runValidators: true }
    );

    await recordPermissionAudit({
      performedBy: actor?.sub || actor?._id,
      performedByName: actor?.name || 'Administrator',
      targetId: policy._id,
      targetType: 'HrAttendancePolicy',
      action: 'HR_ATTENDANCE_POLICY_UPDATED',
      oldValue: {
        lateComingThreshold: oldPolicy.lateComingThreshold,
        earlyGoingThreshold: oldPolicy.earlyGoingThreshold,
      },
      newValue: cleanUpdates,
      ipAddress: ip,
    });

    return policy;
  }

  // --- 3. PERFORMANCE REVIEWS ---

  /**
   * Submits a multi-factor weighted performance review.
   * Strictly enforces database-derived team leadership without trusting request body.
   */
  async submitPerformanceReview({
    employeeId,
    fromDate,
    toDate,
    factorScores = [],
    notes = '',
    reviewer,
    ip = null,
  }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      throw new Error('Dates must be in YYYY-MM-DD format');
    }
    if (fromDate > toDate) {
      throw new Error('fromDate cannot be after toDate');
    }

    // 1. Strict Server-Side Authorization: Resolves employee and team from database
    const user = await this.assertCanManageEmployee({ employeeId, actor: reviewer });

    // 2. Fetch active factors to enforce benchmark ceilings and weights
    const activeFactors = await HrPerformanceFactor.find({ isActive: true });
    const factorMap = new Map();
    for (const f of activeFactors) {
      factorMap.set(f.name, f);
      factorMap.set(f._id.toString(), f);
    }

    const items = factorScores.map((scoreItem) => {
      const matched = factorMap.get(scoreItem.factorId) || factorMap.get(scoreItem.factorName);
      const factorName = matched ? matched.name : scoreItem.factorName;
      const benchmarkScore = matched ? matched.benchmarkScore : Number(scoreItem.benchmarkScore) || 10;
      const weight = matched ? matched.weight : Number(scoreItem.weight) || 1;
      const obtainedScore = Math.min(benchmarkScore, Math.max(0, Number(scoreItem.obtainedScore) || 0));

      return {
        factorName,
        benchmarkScore,
        weight,
        obtainedScore,
      };
    });

    if (items.length === 0) {
      throw new Error('Performance review must include at least one factor');
    }

    // 3. Compute weighted score percentage
    const { maxWeightedScore, obtainedWeightedScore, netScorePercentage } = calculatePerformanceScore(items);

    const review = await HrPerformanceReview.findOneAndUpdate(
      { employeeId, fromDate, toDate },
      {
        $set: {
          employeeName: user.name,
          teamId: user.teamId,
          reviewerId: reviewer.sub || reviewer._id,
          reviewerName: reviewer.name || 'Supervisor',
          items,
          maxWeightedScore,
          obtainedWeightedScore,
          netScorePercentage,
          notes,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    await recordPermissionAudit({
      performedBy: reviewer?.sub || reviewer?._id,
      performedByName: reviewer?.name || 'Reviewer',
      targetId: review._id,
      targetType: 'HrPerformanceReview',
      action: 'HR_PERFORMANCE_REVIEW_SUBMITTED',
      oldValue: null,
      newValue: {
        employeeId,
        fromDate,
        toDate,
        netScorePercentage,
      },
      ipAddress: ip,
    });

    return review;
  }

  /**
   * Retrieves team performance reviews.
   */
  async getTeamPerformanceReviews({ teamId, fromDate, toDate, requester }) {
    await this.assertTeamAccess({ teamId, requester });

    const filter = { teamId };
    if (fromDate && toDate) {
      filter.fromDate = { $gte: fromDate };
      filter.toDate = { $lte: toDate };
    }

    const reviews = await HrPerformanceReview.find(filter).sort({ toDate: -1, netScorePercentage: -1 });

    const averageScore =
      reviews.length > 0
        ? Math.round((reviews.reduce((sum, r) => sum + r.netScorePercentage, 0) / reviews.length) * 100) / 100
        : 0;

    return {
      teamId,
      totalReviews: reviews.length,
      averageScorePercentage: averageScore,
      reviews,
    };
  }

  /**
   * Retrieves an employee's performance review history.
   */
  async getEmployeePerformanceHistory({ employeeId, requester }) {
    await this.assertAccessToEmployeeData({ employeeId, requester });

    return HrPerformanceReview.find({ employeeId }).sort({ toDate: -1 });
  }

  // --- 4. INCIDENT & QUICK FEEDBACK REPORTS ---

  /**
   * Logs a supervisor incident note or feedback item.
   */
  async createIncidentReport({
    employeeId,
    date,
    feedbackType,
    title,
    narrative,
    severity = 'LOW',
    actor,
    ip = null,
  }) {
    const user = await this.assertCanManageEmployee({ employeeId, actor });

    const incident = await HrIncidentReport.create({
      employeeId,
      employeeName: user.name,
      teamId: user.teamId,
      loggedBy: actor.sub || actor._id,
      loggedByName: actor.name || 'Supervisor',
      date: date || new Date().toISOString().split('T')[0],
      feedbackType,
      title,
      narrative,
      severity,
    });

    await recordPermissionAudit({
      performedBy: actor?.sub || actor?._id,
      performedByName: actor?.name || 'Supervisor',
      targetId: incident._id,
      targetType: 'HrIncidentReport',
      action: 'HR_INCIDENT_REPORT_CREATED',
      oldValue: null,
      newValue: { employeeId, feedbackType, severity },
      ipAddress: ip,
    });

    return incident;
  }

  async listEmployeeIncidents({ employeeId, fromDate, toDate, requester }) {
    await this.assertAccessToEmployeeData({ employeeId, requester });

    const filter = { employeeId };
    if (fromDate && toDate) {
      filter.date = { $gte: fromDate, $lte: toDate };
    }

    return HrIncidentReport.find(filter).sort({ date: -1 });
  }

  async listTeamIncidents({ teamId, fromDate, toDate, requester }) {
    await this.assertTeamAccess({ teamId, requester });

    const filter = { teamId };
    if (fromDate && toDate) {
      filter.date = { $gte: fromDate, $lte: toDate };
    }

    return HrIncidentReport.find(filter).sort({ date: -1 });
  }

  async resolveIncidentReport({ incidentId, resolutionNotes = '', actor, ip = null }) {
    const incident = await HrIncidentReport.findById(incidentId);
    if (!incident) throw new Error('Incident report not found');

    await this.assertCanManageEmployee({ employeeId: incident.employeeId, actor });

    incident.isResolved = true;
    incident.resolutionNotes = resolutionNotes;
    incident.resolvedBy = actor.sub || actor._id;
    incident.resolvedAt = new Date();
    await incident.save();

    await recordPermissionAudit({
      performedBy: actor?.sub || actor?._id,
      performedByName: actor?.name || 'Supervisor',
      targetId: incident._id,
      targetType: 'HrIncidentReport',
      action: 'HR_INCIDENT_REPORT_RESOLVED',
      oldValue: { isResolved: false },
      newValue: { isResolved: true, resolutionNotes },
      ipAddress: ip,
    });

    return incident;
  }

  // --- 5. ATTENDANCE EXCEPTIONS SUMMARY ---

  /**
   * Computes monthly attendance exceptions for a team from DailyAttendance.
   * Identifies chronic tardiness against configured policy rules.
   */
  async getTeamAttendanceExceptions({ teamId, month, requester }) {
    await this.assertTeamAccess({ teamId, requester });

    const team = await Team.findById(teamId);
    if (!team) throw new Error('Team not found');

    const activeMembers = await User.find({
      _id: { $in: team.members },
      isActive: true,
    }).select('name email role tier');

    const policy = await this.getAttendancePolicy();

    // Query DailyAttendance records for this team and month prefix
    const monthRegex = new RegExp(`^${month}-`);
    const dailyRecords = await DailyAttendance.find({
      teamId,
      date: monthRegex,
    });

    // Aggregate counts in-memory (DocumentDB 5.0 safe)
    const summaryMap = new Map();
    for (const member of activeMembers) {
      summaryMap.set(member._id.toString(), {
        member: { _id: member._id, name: member.name, email: member.email, role: member.role },
        daysPresent: 0,
        lateCount: 0,
        earlyExitCount: 0,
        penaltyDays: 0,
        netAttendedDays: 0,
        isChronicTardy: false,
      });
    }

    for (const rec of dailyRecords) {
      const uId = rec.userId.toString();
      const entry = summaryMap.get(uId);
      if (!entry) continue;

      if (['PRESENT', 'LATE', 'HALF_DAY'].includes(rec.status)) {
        entry.daysPresent += rec.status === 'HALF_DAY' ? 0.5 : 1;
      }
      if (rec.status === 'LATE') {
        entry.lateCount += 1;
      }
    }

    // Apply policy ratios
    for (const entry of summaryMap.values()) {
      entry.penaltyDays = calculatePenaltyDays(entry.lateCount, entry.earlyExitCount, policy);
      entry.netAttendedDays = calculateNetAttendedDays(entry.daysPresent, entry.penaltyDays);
      entry.isChronicTardy = entry.lateCount >= policy.lateComingThreshold;
    }

    return {
      teamId,
      teamName: team.name,
      month,
      policy: {
        lateComingThreshold: policy.lateComingThreshold,
        penaltyDaysPerThreshold: policy.lateComingPenaltyDays,
      },
      members: Array.from(summaryMap.values()),
    };
  }

  // --- 6. FORMULA-SAFE CSV EXPORTS ---

  async exportTeamReviewsCsv({ teamId, fromDate, toDate, requester }) {
    const data = await this.getTeamPerformanceReviews({ teamId, fromDate, toDate, requester });

    const headers = [
      'Review ID',
      'Employee Name',
      'From Date',
      'To Date',
      'Max Weighted Score',
      'Obtained Score',
      'Net Score (%)',
      'Reviewer Name',
      'Notes',
    ];

    const rows = data.reviews.map((r) => [
      r._id,
      r.employeeName,
      r.fromDate,
      r.toDate,
      r.maxWeightedScore,
      r.obtainedWeightedScore,
      `${r.netScorePercentage.toFixed(2)}%`,
      r.reviewerName,
      r.notes,
    ]);

    return this.buildCsvString(headers, rows);
  }

  async exportTeamIncidentsCsv({ teamId, fromDate, toDate, requester }) {
    const incidents = await this.listTeamIncidents({ teamId, fromDate, toDate, requester });

    const headers = [
      'Incident ID',
      'Date',
      'Employee Name',
      'Feedback Type',
      'Severity',
      'Title',
      'Narrative',
      'Logged By',
      'Resolved',
      'Resolution Notes',
    ];

    const rows = incidents.map((item) => [
      item._id,
      item.date,
      item.employeeName,
      item.feedbackType,
      item.severity,
      item.title,
      item.narrative,
      item.loggedByName,
      item.isResolved ? 'YES' : 'NO',
      item.resolutionNotes,
    ]);

    return this.buildCsvString(headers, rows);
  }

  buildCsvString(headers, rows) {
    const all = [headers, ...rows];
    return all
      .map((row) =>
        row
          .map((cell) => {
            const sanitized = sanitizeCsvCell(cell);
            if (/[",\n\r]/.test(sanitized)) {
              return `"${sanitized.replace(/"/g, '""')}"`;
            }
            return sanitized;
          })
          .join(',')
      )
      .join('\r\n');
  }

  // --- 7. STRICT SERVER-SIDE OBJECT AUTHORIZATION GUARDS ---

  /**
   * Asserts that actor is authorized to manage or evaluate the target employee.
   * If actor is a T3 Executive:
   *   1. Queries User from database to get their actual canonical teamId.
   *   2. Queries Team from database using that teamId.
   *   3. Verifies that actor is the designated team.leadId AND employee is in team.members.
   */
  async assertCanManageEmployee({ employeeId, actor }) {
    if (!actor) throw new Error('Unauthenticated');
    const role = actor.role || '';
    if (['ADMIN', 'SUPER_ADMIN'].includes(role)) {
      const user = await User.findById(employeeId);
      if (!user) throw new Error('Employee not found');
      return user;
    }

    if (role === 'T3_EXECUTIVE') {
      const user = await User.findById(employeeId).select('name teamId');
      if (!user) throw new Error('Employee not found');
      if (!user.teamId) throw new Error('Access denied: Member has no team assigned');

      const team = await Team.findById(user.teamId).select('leadId members');
      const isLead = team && team.leadId?.toString() === (actor.sub || actor._id)?.toString();
      const isMember = team && team.members.some((m) => m.toString() === employeeId.toString());

      if (isLead && isMember) {
        return user;
      }
    }

    throw new Error('Access denied: Only designated team leads and administrators are authorized for this action');
  }

  /**
   * Asserts that requester is authorized to view or manage the specified team.
   */
  async assertTeamAccess({ teamId, requester }) {
    if (!requester) throw new Error('Unauthenticated');
    const role = requester.role || '';
    if (['ADMIN', 'SUPER_ADMIN'].includes(role)) return true;

    if (role === 'T3_EXECUTIVE') {
      const team = await Team.findById(teamId).select('leadId');
      if (team && team.leadId?.toString() === (requester.sub || requester._id)?.toString()) {
        return true;
      }
    }

    throw new Error('Access denied: You are not the designated lead for this team');
  }

  /**
   * Asserts that requester can view the specified employee's records.
   * Self, direct team lead, or admin.
   */
  async assertAccessToEmployeeData({ employeeId, requester }) {
    if (!requester) throw new Error('Unauthenticated');
    const isSelf = (requester.sub || requester._id)?.toString() === employeeId.toString();
    const role = requester.role || '';
    if (isSelf || ['ADMIN', 'SUPER_ADMIN'].includes(role)) return true;

    if (role === 'T3_EXECUTIVE') {
      const user = await User.findById(employeeId).select('teamId');
      if (user && user.teamId) {
        const team = await Team.findById(user.teamId).select('leadId members');
        const isLead = team && team.leadId?.toString() === (requester.sub || requester._id)?.toString();
        const isMember = team && team.members.some((m) => m.toString() === employeeId.toString());
        if (isLead && isMember) {
          return true;
        }
      }
    }

    throw new Error('Access denied: Unauthorized to view these records');
  }
}

module.exports = new HrService();
