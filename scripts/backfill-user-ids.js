#!/usr/bin/env node
/**
 * Backfill User IDs script
 *
 * Assigns unique sequential User IDs (e.g. TBI00001) to existing users missing one.
 * Users are processed in deterministic order: createdAt ASC, _id ASC.
 *
 * Usage:
 *   node scripts/backfill-user-ids.js           # Dry-run mode (default, no writes)
 *   node scripts/backfill-user-ids.js --apply   # Apply mode (writes to database)
 *
 * Rules:
 *   - Idempotent: can be run repeatedly without affecting users that already have IDs.
 *   - Prints summary counts only; never prints emails, hashes, passwords, or secrets.
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment variables if available
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
} catch (_) {}

const User = require('../apps/api/src/modules/admin/admin.model');
const Counter = require('../apps/api/src/models/Counter.model');
const { getNextUserId } = require('../apps/api/src/services/userId.service');

async function backfillUserIds(options = {}) {
  const isApply = options.apply === true || process.argv.includes('--apply');
  const userModel = options.userModel || User;
  const nextIdFn = options.getNextUserId || getNextUserId;
  const log = options.logger || console.log;

  log('============================================================');
  log(`MODE: ${isApply ? 'APPLY (Writing changes to database)' : 'DRY-RUN (Simulating changes, no writes)'}`);
  log('============================================================');

  const missingFilter = {
    $or: [
      { userId: { $exists: false } },
      { userId: null },
      { userId: '' },
    ],
  };

  // Total users count
  const totalUsers = typeof userModel.countDocuments === 'function'
    ? await userModel.countDocuments({})
    : 0;

  // Find users needing backfill, ordered by createdAt ASC, _id ASC
  let query = userModel.find(missingFilter);
  if (query && typeof query.sort === 'function') {
    query = query.sort({ createdAt: 1, _id: 1 });
  }
  if (query && typeof query.select === 'function') {
    query = query.select('_id createdAt');
  }
  const usersToBackfill = await query;

  const countToBackfill = usersToBackfill ? usersToBackfill.length : 0;
  const alreadyWithId = Math.max(0, totalUsers - countToBackfill);

  log(`Total users scanned:   ${totalUsers}`);
  log(`Users already with ID: ${alreadyWithId}`);
  log(`Users missing ID:      ${countToBackfill}`);

  if (countToBackfill === 0) {
    log('\nAll users already have a User ID. No backfill needed (idempotent skip).');
    return {
      totalScanned: totalUsers,
      alreadyWithId,
      needingBackfill: 0,
      applied: 0,
      mode: isApply ? 'apply' : 'dry-run',
    };
  }

  if (!isApply) {
    log('\n--- DRY-RUN PLAN ---');
    log(`Plan: Would assign User IDs to ${countToBackfill} users in order of createdAt, _id.`);
    log('No changes were written to the database.');
    log('To apply these changes, re-run with: node scripts/backfill-user-ids.js --apply');
    return {
      totalScanned: totalUsers,
      alreadyWithId,
      needingBackfill: countToBackfill,
      applied: 0,
      mode: 'dry-run',
    };
  }

  // Apply mode
  let appliedCount = 0;
  for (const user of usersToBackfill) {
    const nextId = await nextIdFn();
    const result = await userModel.updateOne(
      { _id: user._id, ...missingFilter },
      { $set: { userId: nextId } }
    );
    if (result && (result.modifiedCount > 0 || result.nModified > 0)) {
      appliedCount += 1;
    }
  }

  log('\n--- BACKFILL COMPLETED ---');
  log(`Successfully assigned User IDs to ${appliedCount} users.`);

  return {
    totalScanned: totalUsers,
    alreadyWithId,
    needingBackfill: countToBackfill,
    applied: appliedCount,
    mode: 'apply',
  };
}

async function main() {
  const isApply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('FATAL: MONGODB_URI environment variable is required to run backfill script.');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('Connected.');

    const summary = await backfillUserIds({ apply: isApply });
    console.log('\nSummary:', JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error('Backfill error:', err.message);
    process.exit(1);
  } finally {
    if (mongoose.connection?.readyState === 1) {
      await mongoose.disconnect();
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  backfillUserIds,
};
