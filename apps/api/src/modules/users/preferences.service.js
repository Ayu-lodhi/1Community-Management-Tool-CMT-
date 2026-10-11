const User = require('../admin/admin.model');

class PreferencesService {
  // Get preferences for a user
  async getPreferences(userId) {
    const user = await User.findById(userId).select('notificationPrefs');
    if (!user) throw new Error('User not found');

    // Return with defaults applied
    return {
      email: user.notificationPrefs?.email ?? true,
      sms: user.notificationPrefs?.sms ?? false,
      inApp: user.notificationPrefs?.inApp ?? true,
      categories: {
        application: user.notificationPrefs?.categories?.application ?? true,
        event: user.notificationPrefs?.categories?.event ?? true,
        chat: user.notificationPrefs?.categories?.chat ?? true,
        attendance: user.notificationPrefs?.categories?.attendance ?? true,
        system: user.notificationPrefs?.categories?.system ?? true,
      },
    };
  }

  // Update preferences
  async updatePreferences(userId, data) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Ensure notificationPrefs exists
    if (!user.notificationPrefs) {
      user.notificationPrefs = {
        email: true,
        sms: false,
        inApp: true,
        categories: {
          application: true,
          event: true,
          chat: true,
          attendance: true,
          system: true,
        },
      };
    }

    // Update master toggles
    if (typeof data.email === 'boolean') user.notificationPrefs.email = data.email;
    if (typeof data.sms === 'boolean') user.notificationPrefs.sms = data.sms;
    if (typeof data.inApp === 'boolean') user.notificationPrefs.inApp = data.inApp;

    // Update category toggles
    if (data.categories && typeof data.categories === 'object') {
      const cats = user.notificationPrefs.categories || {};
      for (const key of ['application', 'event', 'chat', 'attendance', 'system']) {
        if (typeof data.categories[key] === 'boolean') {
          cats[key] = data.categories[key];
        }
      }
      user.notificationPrefs.categories = cats;
    }

    await user.save();
    return this.getPreferences(userId);
  }
}

module.exports = new PreferencesService();
