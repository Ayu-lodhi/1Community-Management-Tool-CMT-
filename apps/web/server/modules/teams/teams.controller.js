const teamService = require('./teams.service');

exports.getTeams = async (req, res) => {
  try {
    const teams = await teamService.getAllTeams();
    res.json({ success: true, data: teams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTeam = async (req, res) => {
  try {
    const team = await teamService.getTeamById(req.params.id);
    res.json({ success: true, data: team });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

exports.getMyTeams = async (req, res) => {
  try {
    const teams = await teamService.getMyTeams(req.user.sub);
    res.json({ success: true, data: teams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyTeamMembers = async (req, res) => {
  try {
    const members = await teamService.getMyTeamMembers(req.user.sub);
    res.json({ success: true, data: members });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyEventMembers = async (req, res) => {
  try {
    const members = await teamService.getMyEventMembers(req.user.sub);
    res.json({ success: true, data: members });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTeamMembers = async (req, res) => {
  try {
    const members = await teamService.getTeamMembers(req.params.id, req.user.sub);
    res.json({ success: true, data: members });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.createTeam = async (req, res) => {
  try {
    const team = await teamService.createTeam(req.body);
    res.status(201).json({ success: true, message: 'Team created', data: team });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.addMember = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
    const team = await teamService.addMember(req.params.id, userId, req.user);
    res.json({ success: true, message: 'Member added', data: team });
  } catch (error) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const team = await teamService.removeMember(req.params.id, req.params.userId, req.user);
    res.json({ success: true, message: 'Member removed', data: team });
  } catch (error) {
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

exports.deleteTeam = async (req, res) => {
  try {
    await teamService.deleteTeam(req.params.id);
    res.json({ success: true, message: 'Team deleted' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
