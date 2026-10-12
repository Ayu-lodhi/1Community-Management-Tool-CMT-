// apps/api/src/modules/profile/profile.progress.js
// Progress score calculator based on real user activity over rolling 90-day window.

const SIGNAL_WEIGHTS = {
  attendance: 40,
  events: 20,
  teamParticipation: 15,
  certificates: 15,
  reviews: 10,
};

const LEVELS = {
  STAR: { name: 'Star', min: 75 },
  ACTIVE: { name: 'Active', min: 40 },
  BEGINNER: { name: 'Beginner', min: 0 },
};

/**
 * Calculate user progress score from raw activity metrics.
 *
 * @param {Object} metrics
 * @param {number} [metrics.attendanceRatio] - 0 to 1 (attended / scheduled)
 * @param {number} [metrics.eventsRatio] - 0 to 1 (events attended / total target, e.g. 5 events)
 * @param {number} [metrics.teamParticipationRatio] - 0 to 1
 * @param {number} [metrics.certificatesCount] - certificates earned
 * @param {number} [metrics.averageRating] - 1 to 5 average review rating
 * @returns {{ score: number, level: string, breakdown: Object }}
 */
function calculateProgressScore(metrics = {}) {
  let earnedWeight = 0;
  let totalApplicableWeight = 0;

  const breakdown = {};

  // 1. Attendance (40%)
  if (typeof metrics.attendanceRatio === 'number' && !isNaN(metrics.attendanceRatio)) {
    const ratio = Math.max(0, Math.min(1, metrics.attendanceRatio));
    const scorePortion = ratio * SIGNAL_WEIGHTS.attendance;
    earnedWeight += scorePortion;
    totalApplicableWeight += SIGNAL_WEIGHTS.attendance;
    breakdown.attendance = { score: Math.round(scorePortion), weight: SIGNAL_WEIGHTS.attendance, ratio };
  }

  // 2. Events joined (20%)
  if (typeof metrics.eventsRatio === 'number' && !isNaN(metrics.eventsRatio)) {
    const ratio = Math.max(0, Math.min(1, metrics.eventsRatio));
    const scorePortion = ratio * SIGNAL_WEIGHTS.events;
    earnedWeight += scorePortion;
    totalApplicableWeight += SIGNAL_WEIGHTS.events;
    breakdown.events = { score: Math.round(scorePortion), weight: SIGNAL_WEIGHTS.events, ratio };
  }

  // 3. Team participation (15%)
  if (typeof metrics.teamParticipationRatio === 'number' && !isNaN(metrics.teamParticipationRatio)) {
    const ratio = Math.max(0, Math.min(1, metrics.teamParticipationRatio));
    const scorePortion = ratio * SIGNAL_WEIGHTS.teamParticipation;
    earnedWeight += scorePortion;
    totalApplicableWeight += SIGNAL_WEIGHTS.teamParticipation;
    breakdown.teamParticipation = { score: Math.round(scorePortion), weight: SIGNAL_WEIGHTS.teamParticipation, ratio };
  }

  // 4. Certificates (15%) - capped at 3 certificates for 100% of this signal
  if (typeof metrics.certificatesCount === 'number' && !isNaN(metrics.certificatesCount)) {
    const ratio = Math.max(0, Math.min(1, metrics.certificatesCount / 3));
    const scorePortion = ratio * SIGNAL_WEIGHTS.certificates;
    earnedWeight += scorePortion;
    totalApplicableWeight += SIGNAL_WEIGHTS.certificates;
    breakdown.certificates = { score: Math.round(scorePortion), weight: SIGNAL_WEIGHTS.certificates, count: metrics.certificatesCount };
  }

  // 5. Review ratings (10%) - scaled from 1-5 stars
  if (typeof metrics.averageRating === 'number' && !isNaN(metrics.averageRating) && metrics.averageRating > 0) {
    const ratio = Math.max(0, Math.min(1, metrics.averageRating / 5));
    const scorePortion = ratio * SIGNAL_WEIGHTS.reviews;
    earnedWeight += scorePortion;
    totalApplicableWeight += SIGNAL_WEIGHTS.reviews;
    breakdown.reviews = { score: Math.round(scorePortion), weight: SIGNAL_WEIGHTS.reviews, rating: metrics.averageRating };
  }

  // If no signals apply, return score 0
  if (totalApplicableWeight === 0) {
    return { score: 0, level: LEVELS.BEGINNER.name, breakdown: {} };
  }

  // Normalize only across applicable signals
  const normalizedScore = Math.round((earnedWeight / totalApplicableWeight) * 100);
  const finalScore = Math.max(0, Math.min(100, normalizedScore));

  let level = LEVELS.BEGINNER.name;
  if (finalScore >= LEVELS.STAR.min) {
    level = LEVELS.STAR.name;
  } else if (finalScore >= LEVELS.ACTIVE.min) {
    level = LEVELS.ACTIVE.name;
  }

  return {
    score: finalScore,
    level,
    breakdown,
  };
}

module.exports = {
  calculateProgressScore,
  SIGNAL_WEIGHTS,
  LEVELS,
};
