const Notification = require('./notifications.model');

exports.getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.sub }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, data: notifications });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.sub },
      { isRead: true },
    );
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.sub, isRead: false }, { isRead: true });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.markTypeRead = async (req, res) => {
  try {
    const { type } = req.params;
    await Notification.updateMany({ userId: req.user.sub, type, isRead: false }, { isRead: true });
    res.json({ success: true, message: `Marked ${type} notifications as read` });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

