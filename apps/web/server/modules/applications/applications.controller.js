const service = require('./applications.service');

exports.getApplications = async (req, res) => {
  try {
    const list = await service.getAll(req.query, req.user);
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getMyApplications = async (req, res) => {
  try {
    const list = await service.getMine(req.user.sub);
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.createApplication = async (req, res) => {
  try {
    const app = await service.create(req.body, req.user);
    res.status(201).json({ success: true, message: 'Application submitted', data: app });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const app = await service.updateStatus(req.params.id, status, req.user, rejectionReason);
    res.json({ success: true, message: `Application ${status}`, data: app });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
