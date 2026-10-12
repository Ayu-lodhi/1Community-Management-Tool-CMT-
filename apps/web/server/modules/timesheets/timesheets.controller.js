const service = require('./timesheets.service');

exports.submit = async (req, res) => {
  try {
    const ts = await service.submit(req.user.sub, req.body);
    res.status(201).json({ success: true, message: 'Timesheet submitted', data: ts });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getMine = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const list = await service.getMyTimesheets(req.user.sub, days);
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getMyStats = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const stats = await service.getMyStats(req.user.sub, days);
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getTeamTimesheets = async (req, res) => {
  try {
    const { teamId, date } = req.query;
    if (!teamId) return res.status(400).json({ success: false, message: 'teamId required' });
    const list = await service.getTeamTimesheets(req.user.sub, teamId, date);
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getReviewableTeams = async (req, res) => {
  try {
    const teams = await service.getReviewableTeams(req.user.sub);
    res.json({ success: true, data: teams });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const list = await service.getAllTimesheets(req.query);
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const ts = await service.updateStatus(req.params.id, status, req.user, rejectionReason);
    res.json({ success: true, message: `Timesheet ${status}`, data: ts });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    await service.delete(req.params.id, req.user.sub);
    res.json({ success: true, message: 'Timesheet deleted' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.exportTeamCSV = async (req, res) => {
  try {
    const { teamId, from, to } = req.query;
    if (!teamId) return res.status(400).json({ success: false, message: 'teamId required' });
    const data = await service.exportTeamCSV(teamId, from, to, req.user);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};
