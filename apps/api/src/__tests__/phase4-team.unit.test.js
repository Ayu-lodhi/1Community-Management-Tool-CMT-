const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'unit_test_access_secret_32_characters_long';
process.env.JWT_REFRESH_SECRET = 'unit_test_refresh_secret_32_characters_long';

const { requireTeam } = require('../modules/auth/auth.middleware');
const Team = require('../modules/teams/teams.model');

test('Phase 4 - requireTeam allows authorized user and denies unauthorized user', async () => {
  const middleware = requireTeam('Engineering');

  // Case 1: user with team: 'Engineering'
  let nextCalled = false;
  const req1 = {
    user: { sub: 'user-1', role: 'T1', team: 'Engineering' },
  };
  const res1 = {
    status: (code) => {
      res1.statusCode = code;
      return res1;
    },
    json: (data) => {
      res1.body = data;
      return res1;
    },
  };
  await middleware(req1, res1, () => { nextCalled = true; });
  assert.equal(nextCalled, true, 'User with matching team must be allowed');

  // Case 2: user with team: 'engineering' (case-insensitive)
  nextCalled = false;
  const req2 = {
    user: { sub: 'user-1', role: 'T1', team: 'engineering' },
  };
  await middleware(req2, res1, () => { nextCalled = true; });
  assert.equal(nextCalled, true, 'Case-insensitive team match must be allowed');

  // Case 3: user with different team
  nextCalled = false;
  const req3 = {
    user: { sub: 'user-1', role: 'T1', team: 'Marketing' },
  };
  const origFindOne = Team.findOne;
  Team.findOne = async () => null;

  try {
    await middleware(req3, res1, () => { nextCalled = true; });
    assert.equal(nextCalled, false, 'User with different team must be denied');
    assert.equal(res1.statusCode, 403);
    assert.match(res1.body.message, /Engineering team membership required/);
  } finally {
    Team.findOne = origFindOne;
  }
});

test('Phase 4 - requireTeam treats regex metacharacters as literal text', async () => {
  const origFindOne = Team.findOne;
  const capturedQueries = [];

  Team.findOne = async (query) => {
    capturedQueries.push(query);
    return null;
  };

  try {
    const dangerousNames = [
      '.*',
      '(test)',
      '[abc]',
      'team$name',
      'team|other',
      'a\\b',
      'team+plus',
      'team?question',
      '{2,3}',
    ];

    for (const teamName of dangerousNames) {
      capturedQueries.length = 0;
      const middleware = requireTeam(teamName);
      const req = {
        user: { sub: 'user-test-id', role: 'T1' },
      };
      const res = {
        status: () => res,
        json: () => res,
      };

      await middleware(req, res, () => {});

      assert.equal(capturedQueries.length, 1, `Team.findOne must be queried for ${teamName}`);
      const nameRegex = capturedQueries[0].name;
      assert.ok(nameRegex instanceof RegExp, 'Query name must be a RegExp instance');

      // The regex MUST match the literal teamName exactly (case-insensitive)
      assert.equal(nameRegex.test(teamName), true, `Must match literal ${teamName}`);
      assert.equal(nameRegex.test(teamName.toLowerCase()), true, `Must match case-insensitively for ${teamName}`);

      // Crucial: The regex must NOT treat metacharacters as pattern matching
      if (teamName === '.*') {
        assert.equal(nameRegex.test('Engineering'), false, '.* pattern must NOT match arbitrary string Engineering');
        assert.equal(nameRegex.test('Admin'), false, '.* pattern must NOT match arbitrary string Admin');
      } else if (teamName === '[abc]') {
        assert.equal(nameRegex.test('a'), false, '[abc] pattern must NOT match literal "a"');
        assert.equal(nameRegex.test('b'), false, '[abc] pattern must NOT match literal "b"');
      } else if (teamName === 'team|other') {
        assert.equal(nameRegex.test('team'), false, 'team|other pattern must NOT match "team"');
        assert.equal(nameRegex.test('other'), false, 'team|other pattern must NOT match "other"');
      }
    }
  } finally {
    Team.findOne = origFindOne;
  }
});
