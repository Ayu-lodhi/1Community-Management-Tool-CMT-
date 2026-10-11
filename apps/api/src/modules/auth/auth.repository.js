const User = require('../admin/admin.model');

exports.findByEmail = (email) => User.findOne({ email }).select('+password +mfa +passwordChangeStartedAt');
exports.findById = (id) => User.findById(id).select('+password +mfa +passwordChangeStartedAt');

// Reserve attempts atomically across API instances and across login challenges.
exports.reserveMfaAttempt = async (id, version) => {
  const now = new Date();
  await User.updateOne({
    _id: id, 'mfa.version': version,
    'mfa.windowStartedAt': { $lte: new Date(now.getTime() - 5 * 60 * 1000) },
  }, { $set: { 'mfa.attempts': 0, 'mfa.windowStartedAt': now } });
  return User.findOneAndUpdate({
    _id: id, isActive: true, 'mfa.version': version, 'mfa.attempts': { $lt: 5 },
  }, { $inc: { 'mfa.attempts': 1 } }, { new: true }).select('+password +mfa +passwordChangeStartedAt');
};

exports.consumeMfaCode = (user, timeStep) => User.findOneAndUpdate({
  _id: user._id, isActive: true, role: user.role, password: user.password,
  mustChangePassword: user.mustChangePassword,
  passwordChangeStartedAt: user.passwordChangeStartedAt || null,
  'mfa.version': user.mfa.version, 'mfa.lastStep': { $lt: timeStep },
}, { $set: { 'mfa.lastStep': timeStep } }, { new: true }).select('+password +mfa +passwordChangeStartedAt');

// No HTTP enrollment/reset: only a trusted operator may provision a factor.
exports.enrollMfa = (id, role, mfa) => User.findOneAndUpdate({
  _id: id, role, isActive: true, mfa: { $exists: false },
}, { $set: { mfa } }, { new: true });

// Compare-and-set every credential field so resets, role/factor changes and
// competing logins/replacements cannot overwrite one another's password proof.
const credentialFilter = (user) => ({
  _id: user._id, isActive: true, role: user.role, password: user.password,
  mustChangePassword: user.mustChangePassword,
  passwordChangeStartedAt: user.passwordChangeStartedAt || null,
  'mfa.version': user.mfa?.version || { $exists: false },
});

exports.consumeTemporaryPassword = (user) => User.findOneAndUpdate({
  ...credentialFilter(user), mustChangePassword: true, passwordChangeStartedAt: null,
}, { $set: { passwordChangeStartedAt: new Date(), updatedAt: new Date() } },
{ new: true }).select('+password +mfa +passwordChangeStartedAt');

exports.replacePassword = (user, password) => User.findOneAndUpdate(credentialFilter(user), {
  $set: { password, mustChangePassword: false, passwordChangeStartedAt: null, lastPasswordUpdatedAt: new Date(), updatedAt: new Date() },
}, { new: true });
