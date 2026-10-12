import test from 'node:test';
import assert from 'node:assert/strict';
import api from '../api.js';

test('client api: safe endpoints cache GET responses while auth is excluded', async (t) => {
  let fetchCount = 0;
  globalThis.fetch = async (url) => {
    fetchCount++;
    return {
      ok: true,
      json: async () => ({ message: 'success', count: fetchCount }),
    };
  };

  api.clearCache();

  // 1. Fetching a safe endpoint twice should use cache on second call
  const res1 = await api.get('/events');
  const res2 = await api.get('/events');
  assert.equal(fetchCount, 1, 'Safe endpoint /events must be cached');
  assert.equal(res1.data.count, res2.data.count);

  // 2. Auth endpoint must NEVER be cached
  await api.get('/auth/me');
  await api.get('/auth/me');
  assert.equal(fetchCount, 3, 'Auth endpoint must bypass client cache every time');

  // 3. Post mutating request must clear safe cache
  await api.post('/events', { title: 'New Event' });
  await api.get('/events');
  assert.equal(fetchCount, 5, 'Mutating POST must clear the cache');
});
