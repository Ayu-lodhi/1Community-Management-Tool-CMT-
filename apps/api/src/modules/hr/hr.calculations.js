'use strict';

/**
 * Calculates weighted performance score percentage (0-100%).
 * Formulated: score = sum(obtained x weight) / sum(max x weight) x 100
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
    const weight = item.weight !== undefined ? Number(item.weight) : 1;
    const obtained = Number(item.obtainedScore) || 0;

    // Disregard items with non-positive benchmarkScore
    if (bench <= 0 || isNaN(weight) || weight < 0) continue;

    const clampedObtained = Math.min(bench, Math.max(0, obtained));

    maxWeighted += bench * weight;
    obtainedWeighted += clampedObtained * weight;
  }

  if (maxWeighted <= 0) {
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
 * Neutralizes values beginning with '=', '+', '-', '@', tab, or carriage return.
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

/**
 * Generic RFC 4180 compliant CSV string generator with formula injection defense.
 *
 * @param {object} params
 * @param {string[]} params.headers Column headers
 * @param {Array<Array<*>>} params.rows Data rows
 * @returns {string} Formatted CSV text
 */
function generateSanitizedCsv({ headers = [], rows = [] } = {}) {
  const allRows = [headers, ...rows];
  const lines = allRows.map((row) =>
    row
      .map((cell) => {
        const sanitized = sanitizeCsvCell(cell);
        if (/[",\n\r]/.test(sanitized)) {
          return `"${sanitized.replace(/"/g, '""')}"`;
        }
        return sanitized;
      })
      .join(',')
  );
  return lines.join('\r\n');
}

module.exports = {
  calculatePerformanceScore,
  sanitizeCsvCell,
  generateSanitizedCsv,
};
