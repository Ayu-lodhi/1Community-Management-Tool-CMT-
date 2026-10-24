'use strict';

const HrIncident = require('./hr.incidents.model');
const User = require('../admin/admin.model');
const Team = require('../teams/teams.model');
const { isLeadOfPerson, getLedMemberIds } = require('./hr.permissions');
const { recordHrAudit } = require('./hr.middleware');

// ── CREATE ─────────────────────────────────────────────────────────────────
async function createIncident(req, res, next) {
  try {
    const caller = req.user;
    const callerIdStr = (caller.sub || caller._id || caller.id)?.toString();
    const { employeeId, feedbackType, title, narrative, severity, date } = req.body;

    // Rule: Nobody reports on or reviews themselves
    if (callerIdStr === employeeId?.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied: You cannot create an incident report on yourself.' });
    }

    // Verify employee exists
    const employee = await User.findById(employeeId).select('_id name');
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    let resolvedTeamId;

    if (caller.role === 'T3_EXECUTIVE') {
      // Rule: Team from body ignored. Derive strictly from DB: Team.findOne({ leadId: caller, members: targetUserId })
      const team = await Team.findOne({ leadId: callerIdStr, members: employeeId }).lean();
      if (!team) {
        return res.status(403).json({ success: false, message: 'Access denied: Member is not in any team you lead.' });
      }
      resolvedTeamId = team._id;
    } else {
      // ADMIN / SUPER_ADMIN
      if (req.body.teamId) {
        const team = await Team.findById(req.body.teamId).lean();
        resolvedTeamId = team ? team._id : null;
      }
      if (!resolvedTeamId) {
        const anyTeam = await Team.findOne({ members: employeeId }).lean();
        if (anyTeam) resolvedTeamId = anyTeam._id;
      }
      if (!resolvedTeamId) {
        return res.status(400).json({ success: false, message: 'Team could not be determined for this employee.' });
      }
    }

    const incident = await HrIncident.create({
      employeeId,
      employeeName: employee.name,
      teamId: resolvedTeamId,
      loggedBy: callerIdStr,
      loggedByName: caller.name || caller.role,
      date: date || new Date().toISOString().slice(0, 10),
      feedbackType,
      title,
      narrative,
      severity: severity || 'LOW',
    });

    await recordHrAudit({
      performedBy: callerIdStr,
      performedByName: caller.name || caller.role,
      action: 'HR_INCIDENT_CREATE',
      targetId: incident._id,
      targetType: 'HrIncident',
      details: {
        employeeId,
        teamId: resolvedTeamId,
        feedbackType,
        severity: severity || 'LOW',
      },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: incident });
  } catch (err) {
    next(err);
  }
}

// ── LIST ───────────────────────────────────────────────────────────────────
async function listIncidents(req, res, next) {
  try {
    const caller = req.user;
    const callerIdStr = (caller.sub || caller._id || caller.id)?.toString();
    const filter = { isDeleted: { $ne: true } };

    if (caller.role === 'T3_EXECUTIVE') {
      // Union of members of all teams caller leads
      const ledTeams = await Team.find({ leadId: callerIdStr }).select('_id members').lean();
      if (!ledTeams || ledTeams.length === 0) {
        return res.json({ success: true, data: [] });
      }

      const ledTeamIds = new Set(ledTeams.map((t) => t._id.toString()));
      const ledMemberIds = new Set();
      for (const t of ledTeams) {
        for (const m of (t.members || [])) {
          if (m.toString() !== callerIdStr) {
            ledMemberIds.add(m.toString());
          }
        }
      }

      // Optional teamId filter must be verified to be one of caller's led teams
      if (req.query.teamId) {
        if (!ledTeamIds.has(req.query.teamId.toString())) {
          return res.status(403).json({ success: false, message: 'Access denied: You do not lead this team.' });
        }
        filter.teamId = req.query.teamId;
      } else {
        filter.teamId = { $in: Array.from(ledTeamIds) };
      }

      // Optional employeeId filter must be one of caller's led members
      if (req.query.employeeId) {
        if (!ledMemberIds.has(req.query.employeeId.toString())) {
          return res.status(403).json({ success: false, message: 'Access denied: Employee is not in your led teams.' });
        }
        filter.employeeId = req.query.employeeId;
      } else {
        filter.employeeId = { $in: Array.from(ledMemberIds) };
      }
    } else {
      // ADMIN / SUPER_ADMIN
      if (req.query.teamId) filter.teamId = req.query.teamId;
      if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    }

    if (req.query.feedbackType) filter.feedbackType = req.query.feedbackType;
    if (req.query.isResolved !== undefined) filter.isResolved = req.query.isResolved === 'true';
    if (req.query.fromDate && req.query.toDate) {
      filter.date = { $gte: req.query.fromDate, $lte: req.query.toDate };
    }

    const incidents = await HrIncident.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .lean();

    res.json({ success: true, data: incidents });
  } catch (err) {
    next(err);
  }
}

// ── GET ONE ────────────────────────────────────────────────────────────────
async function getIncident(req, res, next) {
  try {
    const caller = req.user;
    const callerIdStr = (caller.sub || caller._id || caller.id)?.toString();
    const incident = await HrIncident.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).lean();

    if (!incident) {
      return res.status(404).json({ success: false, message: 'Incident report not found.' });
    }

    // Nobody sees incident reports about themselves
    if (callerIdStr === incident.employeeId.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied: Cannot view incident report about yourself.' });
    }

    if (caller.role === 'T3_EXECUTIVE') {
      const isLead = await isLeadOfPerson(callerIdStr, incident.employeeId);
      if (!isLead) {
        return res.status(403).json({ success: false, message: 'Access denied: You do not lead this member.' });
      }
    }

    res.json({ success: true, data: incident });
  } catch (err) {
    next(err);
  }
}

// ── UPDATE (Append-only / edit logs before & after) ─────────────────────────
async function updateIncident(req, res, next) {
  try {
    const caller = req.user;
    const callerIdStr = (caller.sub || caller._id || caller.id)?.toString();
    const incident = await HrIncident.findOne({ _id: req.params.id, isDeleted: { $ne: true } });

    if (!incident) {
      return res.status(404).json({ success: false, message: 'Incident report not found.' });
    }

    if (callerIdStr === incident.employeeId.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied: Cannot edit report about yourself.' });
    }

    if (caller.role === 'T3_EXECUTIVE') {
      const isLead = await isLeadOfPerson(callerIdStr, incident.employeeId);
      if (!isLead) {
        return res.status(403).json({ success: false, message: 'Access denied: You do not lead this member.' });
      }
    }

    const oldValue = {
      title: incident.title,
      narrative: incident.narrative,
      severity: incident.severity,
    };

    if (req.body.title !== undefined) incident.title = req.body.title;
    if (req.body.narrative !== undefined) incident.narrative = req.body.narrative;
    if (req.body.severity !== undefined) incident.severity = req.body.severity;

    await incident.save();

    const newValue = {
      title: incident.title,
      narrative: incident.narrative,
      severity: incident.severity,
    };

    await recordHrAudit({
      performedBy: callerIdStr,
      performedByName: caller.name || caller.role,
      action: 'HR_INCIDENT_UPDATE',
      targetId: incident._id,
      targetType: 'HrIncident',
      details: {
        incidentId: incident._id,
        employeeId: incident.employeeId,
        oldValue,
        newValue,
      },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: incident });
  } catch (err) {
    next(err);
  }
}

// ── RESOLVE ────────────────────────────────────────────────────────────────
async function resolveIncident(req, res, next) {
  try {
    const caller = req.user;
    const callerIdStr = (caller.sub || caller._id || caller.id)?.toString();
    const incident = await HrIncident.findOne({ _id: req.params.id, isDeleted: { $ne: true } });

    if (!incident) {
      return res.status(404).json({ success: false, message: 'Incident report not found.' });
    }

    if (callerIdStr === incident.employeeId.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (caller.role === 'T3_EXECUTIVE') {
      const isLead = await isLeadOfPerson(callerIdStr, incident.employeeId);
      if (!isLead) {
        return res.status(403).json({ success: false, message: 'Access denied: You do not lead this member.' });
      }
    }

    incident.isResolved = true;
    incident.resolutionNotes = req.body.resolutionNotes || '';
    incident.resolvedBy = callerIdStr;
    incident.resolvedAt = new Date();
    await incident.save();

    await recordHrAudit({
      performedBy: callerIdStr,
      performedByName: caller.name || caller.role,
      action: 'HR_INCIDENT_RESOLVE',
      targetId: incident._id,
      targetType: 'HrIncident',
      details: {
        incidentId: incident._id,
        isResolved: true,
        resolutionNotes: req.body.resolutionNotes || '',
      },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: incident });
  } catch (err) {
    next(err);
  }
}

// ── SOFT DELETE (Hard delete blocked) ──────────────────────────────────────
async function deleteIncident(req, res, next) {
  try {
    const caller = req.user;
    const callerIdStr = (caller.sub || caller._id || caller.id)?.toString();
    const { deletedReason } = req.body;

    if (!deletedReason || deletedReason.trim().length < 3) {
      return res.status(400).json({ success: false, message: 'A valid reason is required for deletion.' });
    }

    const incident = await HrIncident.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!incident) {
      return res.status(404).json({ success: false, message: 'Incident report not found.' });
    }

    if (caller.role === 'T3_EXECUTIVE') {
      const isLead = await isLeadOfPerson(callerIdStr, incident.employeeId);
      if (!isLead) {
        return res.status(403).json({ success: false, message: 'Access denied: You do not lead this member.' });
      }
    }

    incident.isDeleted = true;
    incident.deletedReason = deletedReason.trim();
    incident.deletedBy = callerIdStr;
    incident.deletedAt = new Date();
    await incident.save();

    await recordHrAudit({
      performedBy: callerIdStr,
      performedByName: caller.name || caller.role,
      action: 'HR_INCIDENT_DELETE_SOFT',
      targetId: incident._id,
      targetType: 'HrIncident',
      details: {
        incidentId: incident._id,
        deletedReason: incident.deletedReason,
      },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Incident report deleted successfully.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createIncident,
  listIncidents,
  getIncident,
  updateIncident,
  resolveIncident,
  deleteIncident,
};
