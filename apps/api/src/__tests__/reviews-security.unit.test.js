const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.ALLOW_NO_REDIS = 'true';
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';

const reviewsController = require('../modules/reviews/reviews.controller');
const Review = require('../modules/reviews/reviews.model');

test('Reviews Security and Rating Validation', async (t) => {
  const origCreate = Review.create;
  const origFindOne = Review.findOne;

  t.afterEach(() => {
    Review.create = origCreate;
    Review.findOne = origFindOne;
  });

  await t.test('createReview rejects rating out of range (< 1 or > 5 or non-integer)', async () => {
    const reviewerId = new mongoose.Types.ObjectId().toString();
    const studentId = new mongoose.Types.ObjectId().toString();

    let statusCode = 200;
    let responseData = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(data) { responseData = data; return this; },
    };

    const req = {
      user: { sub: reviewerId, name: 'Lead Reviewer' },
      body: {
        studentId,
        studentName: 'Alice Volunteer',
        eventId: new mongoose.Types.ObjectId().toString(),
        eventTitle: 'Hackathon 2026',
        rating: 99999, // Exploit payload: out of bounds
        feedback: 'Super human performance',
      },
    };

    await reviewsController.createReview(req, res);
    assert.strictEqual(statusCode, 400);
    assert.match(responseData.message, /rating.*between 1 and 5/i);
  });

  await t.test('createReview rejects self-reviews', async () => {
    const userId = new mongoose.Types.ObjectId().toString();

    let statusCode = 200;
    let responseData = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(data) { responseData = data; return this; },
    };

    const req = {
      user: { sub: userId, name: 'Lead Reviewer' },
      body: {
        studentId: userId, // Self-review
        studentName: 'Lead Reviewer',
        eventId: new mongoose.Types.ObjectId().toString(),
        eventTitle: 'Hackathon 2026',
        rating: 5,
        feedback: 'I did great',
      },
    };

    await reviewsController.createReview(req, res);
    assert.strictEqual(statusCode, 403);
    assert.match(responseData.message, /self-review.*not permitted/i);
  });

  await t.test('createReview rejects duplicate review for same student and event', async () => {
    const reviewerId = new mongoose.Types.ObjectId().toString();
    const studentId = new mongoose.Types.ObjectId().toString();
    const eventId = new mongoose.Types.ObjectId().toString();

    Review.findOne = async () => ({ _id: new mongoose.Types.ObjectId() }); // Duplicate exists

    let statusCode = 200;
    let responseData = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(data) { responseData = data; return this; },
    };

    const req = {
      user: { sub: reviewerId, name: 'Lead Reviewer' },
      body: {
        studentId,
        studentName: 'Alice Volunteer',
        eventId,
        eventTitle: 'Hackathon 2026',
        rating: 5,
        feedback: 'Another review for same event',
      },
    };

    await reviewsController.createReview(req, res);
    assert.strictEqual(statusCode, 409);
    assert.match(responseData.message, /already reviewed/i);
  });
});
