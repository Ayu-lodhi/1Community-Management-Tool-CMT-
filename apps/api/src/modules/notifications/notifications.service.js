const Notification = require('./notifications.model');
const User = require('../admin/admin.model');
const { emitToUser } = require('../../config/socket');
const { enqueueEmail } = require('../../core/queues/queue.service');

// Check if a user wants a specific type of notification
const shouldSend = (prefs, channel, type) => {
  if (!prefs) return true;
  if (prefs[channel] === false) return false;
  if (prefs.categories && prefs.categories[type] === false) return false;
  return true;
};

// BullMQ email queue dispatcher
// Log only fixed status text: recipient/content data can forge records or expose PII.
const queueEmail = async (to, subject, body) => {
  console.log('[EMAIL QUEUED]');
  await enqueueEmail('sendEmail', { to, subject, html: body, text: body, type: 'notification' });
};

const queueSMS = async (to, body) => {
  console.log('[SMS QUEUED]');
  // TODO: smsQueue.add('sendSMS', { to, body });
};

// Create + emit single notification
exports.notify = async (userId, type, title, message, linkTo = '') => {
  try {
    const user = await User.findById(userId).select('email phone notificationPrefs');
    if (!user) return null;

    const prefs = user.notificationPrefs || {};
    let notif = null;

    // 1. In-app notification
    if (shouldSend(prefs, 'inApp', type)) {
      notif = await Notification.create({ userId, type, title, message, linkTo });
      await emitToUser(userId, 'notification:new', {
        _id: notif._id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        linkTo: notif.linkTo || linkTo,
        isRead: false,
        createdAt: notif.createdAt,
      });
    }

    // 2. Email
    if (shouldSend(prefs, 'email', type) && user.email) {
      await queueEmail(user.email, title, message);
    }

    // 3. SMS
    if (shouldSend(prefs, 'sms', type) && user.phone) {
      await queueSMS(user.phone, `${title}: ${message}`);
    }

    return notif;
  } catch (err) {
    console.error('Notify failed:', err.message);
  }
};

// Notify many users
exports.notifyMany = async (userIds, type, title, message, linkTo = '') => {
  try {
    const results = [];
    for (const userId of userIds) {
      const r = await exports.notify(userId, type, title, message, linkTo);
      if (r) results.push(r);
    }
    return results;
  } catch (err) {
    console.error('NotifyMany failed:', err.message);
  }
};

// Notify all users except the actor
exports.notifyAll = async (excludeUserId, type, title, message, linkTo = '', UserModel = User) => {
  try {
    const users = await UserModel.find({ _id: { $ne: excludeUserId }, isActive: true }).select('_id');
    return await exports.notifyMany(users.map((u) => u._id), type, title, message, linkTo);
  } catch (err) {
    console.error('NotifyAll failed:', err.message);
  }
};
