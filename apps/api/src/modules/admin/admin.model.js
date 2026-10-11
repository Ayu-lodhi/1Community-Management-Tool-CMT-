const mongoose = require('mongoose');

const mfaSchema = new mongoose.Schema({
  secret: { type: String, required: true }, // AES-256-GCM encrypted TOTP secret
  version: { type: String, required: true },
  lastStep: { type: Number, default: -1 },
  attempts: { type: Number, default: 0 },
  windowStartedAt: { type: Date, default: Date.now },
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: { type: String, default: '' },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['SUPER_ADMIN', 'ADMIN', 'T3_EXECUTIVE', 'T2_ASSOCIATE', 'T1_VOLUNTEER'],
    default: 'T1_VOLUNTEER',
  },
  tier: {
    type: String,
    enum: ['T1', 'T2', 'T3'],
    default: function () {
      return (this.role === 'SUPER_ADMIN' || this.role === 'ADMIN' || this.role === 'T3_EXECUTIVE') ? 'T3' : 'T1';
    },
  },
  isActive: { type: Boolean, default: true },
  mfa: { type: mfaSchema, select: false },
  mustChangePassword: { type: Boolean, default: true },
  // Set atomically on first temporary-password login; reset only with new credentials.
  passwordChangeStartedAt: { type: Date, default: null, select: false },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },

  // Single active session tracking
  activeSessionId: { type: String, default: null },
  lastActivity: { type: Date, default: null },

  // Admin explicit permission overrides
  customGrants: { type: [String], default: undefined },

  // Profile fields
  skills: { type: String, default: '' },
  availability: { type: String, default: '' },
  bio: { type: String, default: '' },

  // Daily update limit tracking
  lastProfileUpdatedAt: { type: Date, default: null },
  lastPasswordUpdatedAt: { type: Date, default: null },
  lastEmailUpdatedAt: { type: Date, default: null },

  // One-time password reset link
  passwordResetToken: { type: String, default: null, select: false },
  passwordResetExpiry: { type: Date, default: null, select: false },

  // NOTIFICATION PREFERENCES
  notificationPrefs: {
    // Master channel toggles
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
    inApp: { type: Boolean, default: true },

    // Per-category toggles (which types of notifications to receive)
    categories: {
      application: { type: Boolean, default: true },
      event: { type: Boolean, default: true },
      chat: { type: Boolean, default: true },
      attendance: { type: Boolean, default: true },
      system: { type: Boolean, default: true },
      announcement: { type: Boolean, default: true },
      review: { type: Boolean, default: true },
    },
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

userSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);