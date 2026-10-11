// apps/api/src/modules/profile/profile.completion.js
// Server-side profile completion calculator.
// Returns { percent, missing: [{ key, label, points }] }
// Weights must sum to exactly 100. The client ONLY displays this — never computes it.

const WEIGHTS = {
  avatar: 10,
  education: 10,
  skills: 10,
  projects: 10,
  bio: 10,
  linkedinUrl: 10,
  mobileVerified: 5,
  emailVerified: 5,
  birthday: 5,
  city: 5,
  university: 5,
  gender: 5,
  headline: 5,
  mobile: 5,
};

// Sanity assertion (fails loudly at startup if config is broken)
const TOTAL = Object.values(WEIGHTS).reduce((s, v) => s + v, 0);
if (TOTAL !== 100) {
  throw new Error(`Completion weights must sum to 100 but got ${TOTAL}`);
}

const LABELS = {
  avatar: 'Add a profile photo',
  education: 'Add your education',
  skills: 'Add at least one skill',
  projects: 'Add a project',
  bio: 'Write a short bio',
  linkedinUrl: 'Add your LinkedIn profile',
  mobileVerified: 'Verify your mobile number',
  emailVerified: 'Verify your email address',
  birthday: 'Add your birthday',
  city: 'Add your city',
  university: 'Add your university',
  gender: 'Add your gender',
  headline: 'Add your headline / course',
  mobile: 'Add your mobile number',
};

/**
 * Calculate completion for a given profile document.
 * @param {Object} profile — plain object (lean)
 * @param {Object} user    — plain object (lean) for emailVerified if stored there
 * @returns {{ percent: number, missing: Array<{key,label,points}> }}
 */
function calculateCompletion(profile = {}, user = {}) {
  const missing = [];
  let earned = 0;

  const check = (key, hasValue) => {
    if (hasValue) {
      earned += WEIGHTS[key];
    } else {
      missing.push({ key, label: LABELS[key], points: WEIGHTS[key] });
    }
  };

  check('avatar', !!((profile.avatarKey && profile.avatarKey.length > 0) || (profile.avatarUrl && profile.avatarUrl.length > 0)));
  check('education', Array.isArray(profile.education) && profile.education.length > 0);
  check('skills', Array.isArray(profile.skills) && profile.skills.length > 0);
  check('projects', Array.isArray(profile.projects) && profile.projects.length > 0);
  check('bio', !!(profile.bio && profile.bio.trim().length > 10));
  check('linkedinUrl', !!(profile.linkedinUrl && profile.linkedinUrl.length > 0));
  check('mobileVerified', profile.mobileVerified === true);
  check('emailVerified', profile.emailVerified === true || user.emailVerified === true);
  check('birthday', !!profile.birthday);
  check('city', !!(profile.city && profile.city.trim().length > 0));
  check('university', !!(profile.university && profile.university.trim().length > 0));
  check('gender', !!(profile.gender && profile.gender.length > 0));
  check('headline', !!(profile.headline && profile.headline.trim().length > 0));
  check('mobile', !!(profile.mobile && profile.mobile.trim().length > 0));

  const percent = Math.min(100, Math.max(0, earned));
  return { percent, missing };
}

module.exports = { calculateCompletion, WEIGHTS };
