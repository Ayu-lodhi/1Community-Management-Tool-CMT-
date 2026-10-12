const test = require('node:test');
const assert = require('node:assert/strict');
const Review = require('../reviews.model');
const { getAllReviews, getMyReviews } = require('../reviews.controller');

test('reviews.controller: getAllReviews supports pagination parameters', async (t) => {
  // Mock Review.find and countDocuments
  const origFind = Review.find;
  const origCount = Review.countDocuments;

  Review.find = () => ({
    sort: () => ({
      skip: () => ({
        limit: () => ({
          lean: async () => [{ _id: '1', feedback: 'Great!' }],
        }),
      }),
    }),
  });

  Review.countDocuments = async () => 1;

  const req = { query: { page: '1', limit: '10' } };
  let jsonResult = null;
  const res = {
    json: (data) => { jsonResult = data; },
    status: () => res,
  };

  try {
    await getAllReviews(req, res);
    assert.equal(jsonResult.success, true);
    assert.equal(Array.isArray(jsonResult.data), true);
    assert.equal(jsonResult.pagination.total, 1);
    assert.equal(jsonResult.pagination.page, 1);
    assert.equal(jsonResult.pagination.limit, 10);
  } finally {
    Review.find = origFind;
    Review.countDocuments = origCount;
  }
});
