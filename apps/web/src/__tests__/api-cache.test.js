import test from 'node:test';
import assert from 'node:assert/strict';
import api from '../api.js';

test('client api: safe endpoints cache GET responses while auth is excluded', async (t) => {
  let fetchCount = 0;
  const fetchedUrls = [];
  globalThis.fetch = async (url) => {
    fetchCount++;
    fetchedUrls.push(url);
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

  // 3. Post mutating request must selectively clear only its resource cache
  await api.get('/announcements');
  const countBeforeMutate = fetchCount;
  await api.post('/events', { title: 'New Event' });
  // /events should be invalidated
  await api.get('/events');
  // /announcements should STILL be cached and not refetched
  await api.get('/announcements');
  assert.equal(fetchCount, countBeforeMutate + 2, 'Mutating POST to /events clears /events but leaves /announcements intact');

  // 4. In-flight request deduplication
  api.clearCache();
  fetchCount = 0;
  const [p1, p2] = await Promise.all([
    api.get('/events'),
    api.get('/events'),
  ]);
  assert.equal(fetchCount, 1, 'Concurrent in-flight GET requests for the same URL must be deduplicated to 1 call');
  assert.equal(p1.data.count, p2.data.count);
});
