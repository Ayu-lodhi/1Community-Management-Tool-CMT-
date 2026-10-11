const service = require('./attendance.service');
const linkService = require('./attendanceLink.service');

const KNOWN_ERROR_STATUSES = new Set([400, 403, 404, 409, 410, 425]);

const handleAttendanceError = (res, err) => {
  const statusCode = err.statusCode || (typeof err.status === 'number' ? err.status : null);

  if (statusCode && KNOWN_ERROR_STATUSES.has(statusCode)) {
    return res.status(statusCode).json({ success: false, message: err.message });
  }

  // Unexpected errors (no statusCode, or 5xx): log without PII and return generic message
  console.error('[AttendanceController] Unexpected error:', err.name || 'Error', err.message);
  return res.status(500).json({
    success: false,
    message: 'An unexpected error occurred. Please try again shortly.',
  });
};

exports.markAttendance = async (req, res) => {
  try {
    const record = await service.markAttendance(req.body, req.user);
    res.status(200).json({ success: true, message: 'Attendance marked', data: record });
  } catch (err) {
    handleAttendanceError(res, err);
  }
};

exports.selfCheckIn = async (req, res) => {
  try {
    const record = await service.selfCheckIn(req.user, req.body);
    res.status(201).json({ success: true, message: 'Checked in', data: record });
  } catch (err) {
    handleAttendanceError(res, err);
  }
};

exports.selfCheckOut = async (req, res) => {
  try {
    const record = await service.selfCheckOut(req.user, req.body);
    res.status(200).json({ success: true, message: 'Checked out', data: record });
  } catch (err) {
    handleAttendanceError(res, err);
  }
};

exports.getTeamAttendance = async (req, res) => {
  try {
    const { teamId, date } = req.query;
    if (!teamId) return res.status(400).json({ success: false, message: 'teamId required' });
    const data = await service.getTeamAttendance(teamId, date, req.user);
    res.json({ success: true, data });
  } catch (err) {
    handleAttendanceError(res, err);
  }
};

exports.getTeamStats = async (req, res) => {
  try {
    const { teamId, date } = req.query;
    if (!teamId) return res.status(400).json({ success: false, message: 'teamId required' });
    const data = await service.getTeamAttendanceStats(teamId, date, req.user);
    res.json({ success: true, data });
  } catch (err) {
    handleAttendanceError(res, err);
  }
};

exports.getTeamHistory = async (req, res) => {
  try {
    const { teamId, days } = req.query;
    if (!teamId) return res.status(400).json({ success: false, message: 'teamId required' });
    const data = await service.getTeamAttendanceHistory(teamId, days, req.user);
    res.json({ success: true, data });
  } catch (err) {
    handleAttendanceError(res, err);
  }
};

exports.getMyStats = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = await service.getMyAttendanceStats(req.user.sub, days);
    res.json({ success: true, data });
  } catch (err) {
    handleAttendanceError(res, err);
  }
};

exports.getMyAttendance = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const records = await service.getMyAttendance(req.user.sub, days);
    res.json({ success: true, data: records });
  } catch (err) {
    handleAttendanceError(res, err);
  }
};

exports.getTodayStatus = async (req, res) => {
  try {
    const { teamId } = req.query;
    const record = await service.getTodayStatus(req.user.sub, teamId);
    res.json({ success: true, data: record || null });
  } catch (err) {
    handleAttendanceError(res, err);
  }
};

exports.downloadSheet = async (req, res) => {
  try {
    const { teamId, from, to } = req.query;
    if (!teamId) return res.status(400).json({ success: false, message: 'teamId required' });
    const data = await service.getAttendanceSheet(teamId, from, to, req.user);
    res.json({ success: true, data });
  } catch (err) {
    handleAttendanceError(res, err);
  }
};

// Time-Limited Attendance Link & QR (T3)
exports.generateLink = async (req, res) => {
  try {
    const data = await linkService.generateLink(req.body, req.user);
    res.status(201).json({ success: true, message: 'Attendance link generated', data });
  } catch (err) {
    handleAttendanceError(res, err);
  }
};

exports.getLinkInfo = async (req, res) => {
  try {
    const data = await linkService.getLinkInfo(req.params.token, req.user);
    res.status(200).json({ success: true, data });
  } catch (err) {
    handleAttendanceError(res, err);
  }
};

exports.markLinkAttendance = async (req, res) => {
  try {
    const record = await linkService.markAttendance(req.params.token, req.user);
    res.status(201).json({ success: true, message: 'Attendance marked successfully', data: record });
  } catch (err) {
    handleAttendanceError(res, err);
  }
};

exports.deactivateLink = async (req, res) => {
  try {
    const data = await linkService.deactivateLink(req.params.token, req.user);
    res.status(200).json({ success: true, message: 'Attendance link deactivated', data });
  } catch (err) {
    handleAttendanceError(res, err);
  }
};

exports.getT3TodayPanel = async (req, res) => {
  try {
    const data = await linkService.getT3TodayPanel();
    res.status(200).json({ success: true, data });
  } catch (err) {
    handleAttendanceError(res, err);
  }
};

exports.shareLinkToChat = async (req, res) => {
  try {
    const data = await linkService.shareLinkToTeamChat(req.params.token, req.body, req.user);
    res.status(200).json({
      success: true,
      message: `Attendance link and QR shared to ${data.teamName} chat successfully!`,
      data,
    });
  } catch (err) {
    handleAttendanceError(res, err);
  }
};
