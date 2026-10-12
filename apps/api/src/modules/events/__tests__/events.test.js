const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const express = require('express');
const mongoose = require('mongoose');
const BaseRepository = require('../../../core/BaseRepository');
const Event = require('../events.model');
const User = require('../../admin/admin.model');
const { ROLES } = require('../../../../../../packages/shared-constants/roles.js');

const id = (digit) => new mongoose.Types.ObjectId(digit.repeat(24));
const expression = { $function: { body: 'function () { return "harmless"; }', args: [], lang: 'js' } };

test('base repository rejects pipelines and operator keys before calling the model', async () => {
  let calls = 0;
  const repository = new BaseRepository({
    findByIdAndUpdate() { calls++; throw new Error('Unexpected model call'); },
  });
  for (const data of [[], [{ $set: { title: expression } }], null, undefined, 'title', 1,
    { $set: { title: 'Injected' } }, { $unset: { title: '' } }, { 'title.value': 'Injected' },
    new Date(), Object.create({ title: 'Inherited' })]) {
    await assert.rejects(repository.updateById(String(id('a')), data), { statusCode: 400 });
  }
  assert.equal(calls, 0);
});

test('event updates through HTTP validate literals before MongoDB IO', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'event-update-test-secret-not-for-production';
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const tokens = require('../../auth/auth.tokens');
  const requester = {
    _id: id('1'), name: 'Admin', email: 'admin@example.test', role: ROLES.ADMIN,
    isActive: true, password: 'fixture-hash', mustChangePassword: false,
  };
  const head = { _id: id('2'), name: 'Head', email: 'head@example.test', role: ROLES.T3_EXECUTIVE };
  const event = {
    _id: id('a'), title: 'Original event', date: '2026-10-01', location: 'Fixture',
    description: 'Original description', status: 'published', headId: null, members: [],
  };
  let writes = [];
  let found = true;
  // Exercise the real parser, authentication, controllers, repositories and
  // Mongoose casting/validation/population; replace only collection IO.
  t.mock.method(User.collection, 'findOne', async () => requester);
  t.mock.method(User.collection, 'find', () => ({ toArray: async () => [head] }));
  t.mock.method(Event.collection, 'findOneAndUpdate', async (query, update, options) => {
    writes.push({ query, update, options });
    return found ? { ...event, ...update.$set } : null;
  });
  t.mock.method(Event.collection, 'findOne', async () => {
    assert.fail('Invalid or empty updates must not fall back to a read');
  });

  const app = express();
  app.use(require('../../../middleware/security.middleware'));
  app.use('/api/v1/events', require('../events.routes'));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ message: err.message }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const request = (body, options = {}) => {
    const token = tokens.sign(requester, 'access', '5m', { isMfaVerified: options.mfa !== false });
    return fetch(`http://127.0.0.1:${server.address().port}/api/v1/events/${event._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(options.noToken ? {} : { Authorization: `Bearer ${token}` }) },
      body: JSON.stringify(body),
    });
  };

  await t.test('rejects pipelines, operators, dotted paths and unknown/server-managed fields', async () => {
    const payloads = [
      [{ $set: { title: expression } }], [{ $set: { title: 'Pipeline' } }], [],
      { $set: { title: 'Operator' } }, { $inc: { applicants: 1 } },
      { 'headId.value': String(head._id) }, { unknown: 'value' },
      ...['members', 'memberIds', 'memberCount', 'headName', 'headEmail', 'teams', 'applicants', 'createdBy', 'createdAt', '_id']
        .map((field) => ({ title: 'Otherwise valid', [field]: 'injected' })),
    ];
    for (const body of payloads) {
      writes = [];
      const response = await request(body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.deepEqual(writes, []);
    }
  });

  await t.test('rejects nested expressions and nonliteral or invalid field values', async () => {
    const payloads = [null, 'scalar', 1, {},
      ...['title', 'date', 'location', 'description', 'headId', 'status'].flatMap((field) => [
        { [field]: expression }, { [field]: ['array'] }, { [field]: 123 }, { [field]: true },
      ]),
      { title: 'ab' }, { title: 'x'.repeat(201) }, { title: null },
      { location: 'a' }, { location: 'x'.repeat(201) }, { date: '' },
      { description: 'x'.repeat(2001) }, { status: 'invalid' }, { headId: 'invalid' },
    ];
    for (const body of payloads) {
      writes = [];
      assert.equal((await request(body)).status, 400, JSON.stringify(body));
      assert.deepEqual(writes, []);
    }
  });

  await t.test('both administrator roles can submit editor fields as a literal $set', async () => {
    const body = { title: 'Updated event', date: '2026-10-02', location: 'New hall', description: '', headId: String(head._id) };
    for (const role of [ROLES.ADMIN, ROLES.SUPER_ADMIN]) {
      requester.role = role;
      writes = [];
      const response = await request(body);
      assert.equal(response.status, 200);
      const result = (await response.json()).data;
      assert.equal(result.title, body.title);
      assert.equal(result.headId.name, head.name, 'population is preserved');
      assert.equal(writes.length, 1);
      assert.equal(String(writes[0].query._id), String(event._id));
      assert.deepEqual(writes[0].update, { $set: { ...body, headId: head._id } });
      assert.equal(writes[0].options.returnDocument, 'after');
    }
  });

  await t.test('partial edits preserve other fields and operator-looking text stays literal', async () => {
    writes = [];
    const description = '$function and $title are ordinary text';
    const response = await request({ description });
    assert.equal(response.status, 200);
    const result = (await response.json()).data;
    assert.equal(result.title, event.title);
    assert.equal(result.description, description);
    assert.deepEqual(writes[0].update, { $set: { description } });
    for (const status of ['draft', 'published', 'closed']) {
      assert.equal((await request({ status })).status, 200);
    }
  });

  await t.test('no selected head is saved as null', async () => {
    for (const headId of ['', null]) {
      writes = [];
      assert.equal((await request({ headId })).status, 200);
      assert.deepEqual(writes[0].update, { $set: { headId: null } });
    }
  });

  await t.test('service aliases and direct repository calls cannot bypass validation', async () => {
    writes = [];
    const service = require('../events.service');
    const repository = require('../events.repository');
    for (const update of [service.update.bind(service), service.updateEvent.bind(service), repository.updateById.bind(repository)]) {
      await assert.rejects(update(String(event._id), [{ $set: { title: expression } }]), { statusCode: 400 });
      await assert.rejects(update(String(event._id), { title: expression }), { statusCode: 400 });
    }
    assert.deepEqual(writes, []);
  });

  await t.test('authentication, MFA and role restrictions still apply', async () => {
    writes = [];
    assert.equal((await request({ title: 'Valid title' }, { noToken: true })).status, 401);
    assert.equal((await request({ title: 'Valid title' }, { mfa: false })).status, 401);
    for (const role of [ROLES.T1_VOLUNTEER, ROLES.T2_ASSOCIATE, ROLES.T3_EXECUTIVE]) {
      requester.role = role;
      assert.equal((await request({ title: 'Valid title' })).status, 403);
    }
    assert.deepEqual(writes, []);
    requester.role = ROLES.ADMIN;
  });

  await t.test('missing event retains the existing error response', async () => {
    found = false;
    const response = await request({ title: 'Valid title' });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).message, 'Event not found');
  });
});
