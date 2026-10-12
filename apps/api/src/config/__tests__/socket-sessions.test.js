const assert = require('node:assert/strict');
const { once } = require('node:events');
const http = require('node:http');
const { test } = require('node:test');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'socket-session-regression-secret-only';
const tokens = require('../../modules/auth/auth.tokens');
const repository = require('../../modules/auth/auth.repository');
const User = require('../../modules/admin/admin.model');
const ChatRoom = require('../../modules/chat/chatRoom.model');
const Notification = require('../../modules/notifications/notifications.model');
const admin = require('../../modules/admin/admin.service');
const { notify } = require('../../modules/notifications/notifications.service');
const { ROLES } = require('../../../../../packages/shared-constants/roles.js');
const { initSocket, emitToUser, emitToRoom, emitToAll, closeChatRoom } = require('../socket');

const userId = '111111111111111111111111';
const otherId = '222222222222222222222222';
const roomId = 'abcdef0123456789abcdef01';

async function fixture(t) {
  const accounts = new Map([userId, otherId].map((id) => [id, {
    _id: id, isActive: true, role: ROLES.T1_VOLUNTEER, password: 'synthetic-hash',
    save: async () => {},
  }]));
  t.mock.method(User, 'findById', (id) => {
    const result = Promise.resolve(accounts.get(id));
    result.select = async () => accounts.get(id);
    return result;
  });
  t.mock.method(User, 'exists', async ({ _id }) => accounts.get(_id)?.isActive ? { _id } : null);
  const roomLookup = t.mock.method(ChatRoom, 'exists', async () => ({ _id: roomId }));
  const server = http.createServer();
  const io = initSocket(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => io.close(resolve)));

  async function connect(id = userId, token = tokens.sign(accounts.get(id), 'access', '5m')) {
    const client = new WebSocket(`ws://127.0.0.1:${server.address().port}/socket.io/?EIO=4&transport=websocket`);
    t.after(() => client.close());
    return new Promise((resolve, reject) => {
      client.addEventListener('error', reject, { once: true });
      client.addEventListener('message', ({ data }) => {
        if (data.startsWith('0')) client.send(`40${JSON.stringify({ token })}`);
        if (data.startsWith('40')) {
          const socket = io.sockets.sockets.get(JSON.parse(data.slice(2)).sid);
          const events = [];
          socket.onAnyOutgoing((...args) => events.push(args));
          resolve({ socket, events });
        }
        if (data.startsWith('44')) reject(new Error(JSON.parse(data.slice(2)).message));
        if (data === '2') client.send('3');
      });
    });
  }
  return { accounts, roomLookup, connect };
}

const join = (client) => client.socket.listeners('chat:join')[0](roomId);

test('socket handshake rejects inactive/deleted accounts and credentials without expiry', async (t) => {
  const { accounts, connect } = await fixture(t);
  const token = tokens.sign(accounts.get(userId), 'access', '5m');
  accounts.get(userId).isActive = false;
  await assert.rejects(connect(userId, token), /Invalid or expired token/);
  accounts.delete(userId);
  await assert.rejects(connect(userId, token), /Invalid or expired token/);
  const user = accounts.get(otherId);
  const noExpiry = jwt.sign({ sub: otherId, purpose: 'access', authState: tokens.authState(user) }, process.env.JWT_SECRET);
  await assert.rejects(connect(otherId, noExpiry), /Invalid or expired token/);
});

test('successful revocation disconnects every target socket and denies reconnect', async (t) => {
  const { accounts, connect } = await fixture(t);
  const token = tokens.sign(accounts.get(userId), 'access', '5m');
  const first = await connect();
  const second = await connect();
  const other = await connect(otherId);
  await join(first);
  await admin.revokeUser(userId, 'Synthetic revocation', '', otherId);
  assert.equal(first.socket.connected, false);
  assert.equal(second.socket.connected, false);
  assert.equal(first.socket.rooms.size, 0);
  assert.equal(other.socket.connected, true);
  await assert.rejects(connect(userId, token), /Invalid or expired token/);
  await emitToUser(userId, 'notification:new', { message: 'Private' });
  assert.deepEqual(first.events, []);
  accounts.get(userId).isActive = true;
  await assert.rejects(connect(userId, token), /Invalid or expired token/);
});

test('a failed revocation save does not disconnect the account sockets', async (t) => {
  const { accounts, connect } = await fixture(t);
  const client = await connect();
  accounts.get(userId).save = async () => { throw new Error('save failed'); };
  await assert.rejects(admin.revokeUser(userId, 'Synthetic revocation', '', otherId), /save failed/);
  assert.equal(client.socket.connected, true);
});

test('notifications revalidate accounts before delivering private text', async (t) => {
  const { accounts, connect } = await fixture(t);
  t.mock.method(Notification, 'create', async (data) => ({ ...data, _id: 'notification-id' }));
  const client = await connect();
  await notify(userId, 'chat', 'Private room', 'Before revocation');
  assert.equal(client.events.length, 1);
  accounts.get(userId).isActive = false;
  await notify(userId, 'chat', 'Private room', 'After revocation');
  assert.equal(client.events.length, 1);
  assert.equal(client.socket.connected, false);
});

test('every broadcast helper denies changed credentials and account lookup failures', async (t) => {
  const { accounts, connect } = await fixture(t);
  for (const send of [
    () => emitToUser(userId, 'private', {}),
    () => emitToRoom(roomId, 'private', {}),
    () => emitToAll('private', {}),
    () => closeChatRoom(roomId),
  ]) {
    const client = await connect();
    await join(client);
    accounts.get(userId).password += '-changed';
    await send();
    assert.deepEqual(client.events, []);
    assert.equal(client.socket.connected, false);
  }
  const client = await connect();
  t.mock.method(repository, 'findById', async () => { throw new Error('database unavailable'); });
  await emitToUser(userId, 'private', {});
  assert.deepEqual(client.events, []);
  assert.equal(client.socket.connected, false);
});

test('idle connections disconnect at access-token expiry', { timeout: 5000 }, async (t) => {
  const { accounts, connect } = await fixture(t);
  const client = await connect(userId, tokens.sign(accounts.get(userId), 'access', '2s'));
  await join(client);
  await once(client.socket, 'disconnect');
  assert.equal(client.socket.connected, false);
  assert.equal(client.socket.rooms.size, 0);
});

test('expiry during an account lookup blocks delivery even before the timer runs', async (t) => {
  const { connect } = await fixture(t);
  const client = await connect();
  let finish;
  const originalLookup = repository.findById;
  t.mock.method(repository, 'findById', async (id) => {
    const user = await originalLookup(id);
    await new Promise((resolve) => { finish = resolve; });
    return user;
  });
  const pending = emitToUser(userId, 'private', {});
  await new Promise(setImmediate);
  t.mock.method(Date, 'now', () => client.socket.accessExpiresAt);
  finish();
  await pending;
  assert.deepEqual(client.events, []);
  assert.equal(client.socket.connected, false);
});

test('revocation while room authorization is pending prevents a late subscription', async (t) => {
  const { roomLookup, connect } = await fixture(t);
  const client = await connect();
  let finish;
  roomLookup.mock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const pending = join(client);
  await new Promise(setImmediate);
  await admin.revokeUser(userId, 'Synthetic revocation', '', otherId);
  finish({ _id: roomId });
  await pending;
  assert.equal(client.socket.connected, false);
  assert.equal(client.socket.rooms.size, 0);
});

test('subscriptions revalidate credentials and expiry even when the timer has not run', async (t) => {
  const { accounts, connect } = await fixture(t);
  const changed = await connect();
  accounts.get(userId).password += '-changed';
  await join(changed);
  assert.equal(changed.socket.connected, false);
  assert.equal(changed.socket.rooms.size, 0);

  const expired = await connect();
  t.mock.method(Date, 'now', () => expired.socket.accessExpiresAt);
  await join(expired);
  assert.equal(expired.socket.connected, false);
  assert.equal(expired.socket.rooms.size, 0);
});
