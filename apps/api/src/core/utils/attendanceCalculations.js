/**
 * Clean-Room Mathematical Calculation Utilities for Attendance and HR Performance.
 */

/**
 * Calculates late and early arrival penalty days based on configured thresholds.
 * Formulated from Hafta: app/transaction/salary_sheet.py:383-399
 *
 * @param {number} lateCount Number of late arrivals
 * @param {number} earlyCount Number of early departures
 * @param {object} rules Attendance penalty rules
 * @param {number} [rules.lateComingThreshold=3] Threshold count for late coming penalty
 * @param {number} [rules.lateComingPenaltyDays=0.5] Penalty days deducted per threshold
 * @param {number} [rules.earlyGoingThreshold=3] Threshold count for early departure penalty
 * @param {number} [rules.earlyGoingPenaltyDays=0.5] Penalty days deducted per threshold
 * @returns {number} Rounded penalty days (to 2 decimal places)
 */
function calculatePenaltyDays(lateCount = 0, earlyCount = 0, rules = {}) {
  const lateThreshold = Number(rules.lateComingThreshold) || 3;
  const latePenaltyPerThreshold = Number(rules.lateComingPenaltyDays ?? rules.lateComingDeductionDays) || 0.5;
  const earlyThreshold = Number(rules.earlyGoingThreshold) || 3;
  const earlyPenaltyPerThreshold = Number(rules.earlyGoingPenaltyDays ?? rules.earlyGoingDeductionDays) || 0.5;

  const lateRatio = latePenaltyPerThreshold / lateThreshold;
  const earlyRatio = earlyPenaltyPerThreshold / earlyThreshold;

  const latePenalty = (Number(lateCount) || 0) * lateRatio;
  const earlyPenalty = (Number(earlyCount) || 0) * earlyRatio;

  return Math.round((latePenalty + earlyPenalty) * 100) / 100;
}

/**
 * Calculates net attended days after deducting penalties.
 * Formulated from Hafta: app/transaction/salary_sheet.py:398-399
 *
 * @param {number} daysAttended Days attended in month
 * @param {number} penaltyDays Calculated penalty days
 * @returns {number} Non-negative attended days rounded to 2 decimals
 */
function calculateNetAttendedDays(daysAttended = 0, penaltyDays = 0) {
  const net = Math.max(0, (Number(daysAttended) || 0) - (Number(penaltyDays) || 0));
  return Math.round(net * 100) / 100;
}

/**
 * Calculates weighted performance score percentage (0-100%).
 * Formulated from Hafta: app/transaction/performance.py:41-55
 *
 * @param {Array<{ benchmarkScore: number, weight: number, obtainedScore: number }>} items
 * @returns {{ maxWeightedScore: number, obtainedWeightedScore: number, netScorePercentage: number }}
 */
function calculatePerformanceScore(items = []) {
  if (!items || items.length === 0) {
    return { maxWeightedScore: 0, obtainedWeightedScore: 0, netScorePercentage: 0 };
  }

  let maxWeighted = 0;
  let obtainedWeighted = 0;

  for (const item of items) {
    const bench = Number(item.benchmarkScore) || 0;
    const weight = Number(item.weight) || 1;
    const obtained = Math.min(bench, Math.max(0, Number(item.obtainedScore) || 0));

    maxWeighted += bench * weight;
    obtainedWeighted += obtained * weight;
  }

  if (maxWeighted === 0) {
    return { maxWeightedScore: 0, obtainedWeightedScore: 0, netScorePercentage: 0 };
  }

  const rawPercentage = (obtainedWeighted / maxWeighted) * 100;
  const netScorePercentage = Math.round(rawPercentage * 100) / 100;

  return {
    maxWeightedScore: maxWeighted,
    obtainedWeightedScore: obtainedWeighted,
    netScorePercentage: Math.min(100, Math.max(0, netScorePercentage)),
  };
}

/**
 * Defends CSV export cells against Formula Injection (CSV injection).
 * Neutralizes values beginning with '=', '+', '-', '@', or tab.
 *
 * @param {*} value
 * @returns {string}
 */
function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

module.exports = {
  calculatePenaltyDays,
  calculateNetAttendedDays,
  calculatePerformanceScore,
  sanitizeCsvCell,
};
