const service = require('./announcements.service');

exports.create = async (req, res) => {
  try {
    const ann = await service.create(req.body, req.user);
    res.status(201).json({ success: true, message: 'Announcement sent', data: ann });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getMine = async (req, res) => {
  try {
    const list = await service.getMyAnnouncements(req.user);
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    await service.delete(req.params.id, req.user);
    res.json({ success: true, message: 'Announcement deleted' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
