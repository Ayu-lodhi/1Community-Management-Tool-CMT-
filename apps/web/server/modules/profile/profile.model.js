// apps/api/src/modules/profile/profile.model.js
// New Profile model — one-to-one with User. Never modifies the User model.
const mongoose = require('mongoose');

const educationSchema = new mongoose.Schema({
  institution: { type: String, maxlength: 200 },
  degree: { type: String, maxlength: 200 },
  field: { type: String, maxlength: 200 },
  fieldOfStudy: { type: String, maxlength: 200 },
  startYear: { type: Number, default: null },
  endYear: { type: Number, default: null },
  current: { type: Boolean, default: false },
  grade: { type: String, maxlength: 50 },
}, { _id: true });

const projectSchema = new mongoose.Schema({
  title: { type: String, maxlength: 200 },
  description: { type: String, maxlength: 2000 },
  url: { type: String, maxlength: 500 },
  startDate: { type: Date },
  endDate: { type: Date },
  current: { type: Boolean, default: false },
  technologies: [{ type: String, maxlength: 50 }],
}, { _id: true });

const profileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },

  // Personal info
  headline: { type: String, default: '', maxlength: 200 },   // e.g. "MCA"
  university: { type: String, default: '', maxlength: 200 },
  city: { type: String, default: '', maxlength: 100 },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'prefer_not_to_say', 'Male', 'Female', 'Other', 'Non-Binary', 'Prefer not to say', ''],
    default: '',
    set: function (val) {
      if (!val) return '';
      const v = String(val).toLowerCase().trim();
      if (v === 'male') return 'male';
      if (v === 'female') return 'female';
      if (v === 'other' || v === 'non-binary') return 'other';
      if (v === 'prefer not to say' || v === 'prefer_not_to_say') return 'prefer_not_to_say';
      return v;
    },
  },
  birthday: { type: Date, default: null },
  bio: { type: String, default: '', maxlength: 2000 },

  // Contact
  mobile: { type: String, default: '', maxlength: 20 },
  mobileVerified: { type: Boolean, default: false },    // only set by system/OTP flow
  emailVerified: { type: Boolean, default: false },     // only set by system

  // Social
  linkedinUrl: { type: String, default: '', maxlength: 500 },

  // Avatar
  avatarKey: { type: String, default: '' },   // S3 key or filename — never a user-supplied name
  avatarUrl: { type: String, default: '' },   // Signed/public URL, regenerated on read

  // Skills (array of strings)
  skills: [{ type: String, maxlength: 80 }],

  // Education history
  education: [educationSchema],

  // Projects
  projects: [projectSchema],

  // Completion (server-computed only — never writable by user)
  completionPercent: { type: Number, default: 0, min: 0, max: 100 },
  completionMissing: [{
    key: String,
    label: String,
    points: Number,
  }],

  // Progress score (written by background job only)
  progressScore: { type: Number, default: 0, min: 0, max: 100 },
  progressLevel: { type: String, enum: ['Beginner', 'Active', 'Star'], default: 'Beginner' },
  progressBreakdown: { type: mongoose.Schema.Types.Mixed, default: {} },
  progressUpdatedAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  collection: 'profiles',
});


profileSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.Profile || mongoose.model('Profile', profileSchema);
