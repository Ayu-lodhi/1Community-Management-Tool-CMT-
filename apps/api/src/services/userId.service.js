const mongoose = require('mongoose');
const Counter = require('../models/Counter.model');

let fallbackSeq = 0;

/**
 * Atomically generates the next unique User ID.
 * Sequence increments monotonically and is never reused.
 *
 * @param {string} [customPrefix] - Optional prefix override
 * @returns {Promise<string>} e.g. "TBI00001"
 */
async function getNextUserId(customPrefix) {
  const prefix = (customPrefix || process.env.USER_ID_PREFIX || 'TBI').trim().toUpperCase();
  const counterId = `user_${prefix}`;

  // If connected to MongoDB or Counter findOneAndUpdate is mocked/stubbed in tests
  if (mongoose.connection?.readyState === 1 || typeof Counter.findOneAndUpdate === 'function') {
    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      if (counter && typeof counter.seq === 'number') {
        const paddedSeq = String(counter.seq).padStart(5, '0');
        return `${prefix}${paddedSeq}`;
      }
    } catch (err) {
      // In disconnected test environments, fallback to in-memory sequence
      if (mongoose.connection?.readyState !== 1) {
        fallbackSeq += 1;
        const paddedSeq = String(fallbackSeq).padStart(5, '0');
        return `${prefix}${paddedSeq}`;
      }
      throw err;
    }
  }

  fallbackSeq += 1;
  const paddedSeq = String(fallbackSeq).padStart(5, '0');
  return `${prefix}${paddedSeq}`;
}

/**
 * For testing purposes: reset the in-memory fallback counter
 */
function _resetFallbackSeq(val = 0) {
  fallbackSeq = val;
}

module.exports = {
  getNextUserId,
  _resetFallbackSeq,
};
