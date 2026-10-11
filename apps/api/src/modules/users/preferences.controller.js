const preferencesService = require('./preferences.service');

exports.getMyPreferences = async (req, res) => {
  try {
    const prefs = await preferencesService.getPreferences(req.user.sub);
    res.json({ success: true, data: prefs });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateMyPreferences = async (req, res) => {
  try {
    const prefs = await preferencesService.updatePreferences(req.user.sub, req.body);
    res.json({ success: true, message: 'Preferences updated', data: prefs });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
