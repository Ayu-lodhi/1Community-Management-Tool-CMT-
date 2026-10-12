const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateProgressScore, LEVELS } = require('../modules/profile/profile.progress');

test('Progress Score - returns 0 score and Beginner level when no activity metrics exist', () => {
  const result = calculateProgressScore({});
  assert.equal(result.score, 0);
  assert.equal(result.level, LEVELS.BEGINNER.name);
});

test('Progress Score - correctly computes 100% full engagement as Star level', () => {
  const result = calculateProgressScore({
    attendanceRatio: 1.0,
    eventsRatio: 1.0,
    teamParticipationRatio: 1.0,
    certificatesCount: 5, // >= 3
    averageRating: 5.0,
  });

  assert.equal(result.score, 100);
  assert.equal(result.level, LEVELS.STAR.name);
  assert.ok(result.breakdown.attendance);
  assert.ok(result.breakdown.events);
  assert.ok(result.breakdown.teamParticipation);
  assert.ok(result.breakdown.certificates);
  assert.ok(result.breakdown.reviews);
});

test('Progress Score - correctly normalizes when user only has subset of signals', () => {
  // User only has attendance (100%) and no events or certificates
  const result = calculateProgressScore({
    attendanceRatio: 1.0,
  });

  // Because only attendance applies, attendance represents 100% of applicable weight
  assert.equal(result.score, 100);
  assert.equal(result.level, LEVELS.STAR.name);
});

test('Progress Score - boundary thresholds between Beginner, Active, and Star', () => {
  // Active: >= 40, < 75
  const activeRes = calculateProgressScore({
    attendanceRatio: 0.5,
    eventsRatio: 0.5,
  });
  assert.equal(activeRes.score, 50);
  assert.equal(activeRes.level, LEVELS.ACTIVE.name);

  // Beginner: < 40
  const beginnerRes = calculateProgressScore({
    attendanceRatio: 0.3,
  });
  assert.equal(beginnerRes.score, 30);
  assert.equal(beginnerRes.level, LEVELS.BEGINNER.name);
});
