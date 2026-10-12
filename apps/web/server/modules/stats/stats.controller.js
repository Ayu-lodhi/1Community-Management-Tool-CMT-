const statsService = require('./stats.service');

exports.getAdminStats = async (req, res) => {
  try {
    const data = await statsService.getAdminStats();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getUsersByTier = async (req, res) => {
  try {
    const data = await statsService.getUsersByTier();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getApplicationsTrend = async (req, res) => {
  try {
    const data = await statsService.getApplicationsTrend();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getMonthlyApplications = async (req, res) => {
  try {
    const data = await statsService.getMonthlyApplications();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAttendanceStats = async (req, res) => {
  try {
    const data = await statsService.getAttendanceStats();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getT3Stats = async (req, res) => {
  try {
    const data = await statsService.getT3Stats(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getT2Stats = async (req, res) => {
  try {
    const data = await statsService.getT2Stats(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getT1Stats = async (req, res) => {
  try {
    const data = await statsService.getT1Stats(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getTopPerformers = async (req, res) => {
  try {
    const data = await statsService.getTopPerformers(5);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getSuperAdminStats = async (req, res) => {
  try {
    const data = await statsService.getSuperAdminStats();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
