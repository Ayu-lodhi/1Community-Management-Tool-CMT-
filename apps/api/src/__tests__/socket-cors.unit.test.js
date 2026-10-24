const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { initSocket } = require('../config/socket');

test('Socket.io CORS allowlist enforcement', async (t) => {
  let initialAllowed;
  let initialNodeEnv;
  let server;
  let io;
  let baseUrl;

  before(async () => {
    initialAllowed = process.env.ALLOWED_ORIGINS;
    initialNodeEnv = process.env.NODE_ENV;

    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://allowed.example.com, https://admin.example.com';

    server = http.createServer();
    io = initSocket(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling`;
  });

  after(async () => {
    if (io) {
      await new Promise((resolve) => io.close(resolve));
    }
    if (server) {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise((resolve) => server.close(resolve));
    }
    if (initialAllowed === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = initialAllowed;
    if (initialNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = initialNodeEnv;
  });

  await t.test('allowed origin connects with matching CORS header', async () => {
    const res = await fetch(baseUrl, {
      headers: { Origin: 'https://allowed.example.com', Connection: 'close' },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://allowed.example.com');
    assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
  });

  await t.test('unknown origin is rejected without throwing (no CORS header, not 500)', async () => {
    const res = await fetch(baseUrl, {
      headers: { Origin: 'https://unknown.example.com', Connection: 'close' },
    });
    assert.notStrictEqual(res.status, 500);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  await t.test('lookalike evil.vercel.app is rejected (no CORS header, not 500)', async () => {
    const res = await fetch(baseUrl, {
      headers: { Origin: 'https://evil.vercel.app', Connection: 'close' },
    });
    assert.notStrictEqual(res.status, 500);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });
});
