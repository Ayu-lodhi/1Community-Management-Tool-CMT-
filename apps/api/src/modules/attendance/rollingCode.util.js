const crypto = require('crypto');

/**
 * Computes a 6-character uppercase alphanumeric code from a secret, link token, and time step.
 * @param {string} secret
 * @param {string} token
 * @param {number} stepSeconds
 * @param {number} [timestamp]
 * @returns {string} 6-character code
 */
function generateStepCode(secret, token, stepSeconds = 30, timestamp = Date.now()) {
  if (!secret || !token) return '';
  const step = Math.floor(timestamp / (stepSeconds * 1000));
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${token}:${step}`);
  return hmac.digest('hex').slice(0, 6).toUpperCase();
}

/**
 * Validates candidate code against current step T and previous step T-1 using timingSafeEqual.
 * @param {string} candidate
 * @param {string} secret
 * @param {string} token
 * @param {number} stepSeconds
 * @param {number} [timestamp]
 * @returns {boolean}
 */
function verifyStepCode(candidate, secret, token, stepSeconds = 30, timestamp = Date.now()) {
  if (!candidate || typeof candidate !== 'string' || !secret || !token) return false;
  const cleanCandidate = candidate.trim().toUpperCase();
  if (cleanCandidate.length !== 6) return false;

  const currentStep = Math.floor(timestamp / (stepSeconds * 1000));
  const candidateBuf = Buffer.from(cleanCandidate);

  // Check current step T
  const codeT = generateStepCode(secret, token, stepSeconds, timestamp);
  const bufT = Buffer.from(codeT);
  if (candidateBuf.length === bufT.length && crypto.timingSafeEqual(candidateBuf, bufT)) {
    return true;
  }

  // Check previous step T-1
  const prevTimestamp = (currentStep - 1) * stepSeconds * 1000;
  const codePrev = generateStepCode(secret, token, stepSeconds, prevTimestamp);
  const bufPrev = Buffer.from(codePrev);
  if (candidateBuf.length === bufPrev.length && crypto.timingSafeEqual(candidateBuf, bufPrev)) {
    return true;
  }

  return false;
}

module.exports = {
  generateStepCode,
  verifyStepCode,
};
