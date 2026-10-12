const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const superAdminRoutes = require('../modules/super-admin/superAdmin.routes');
const User = require('../modules/admin/admin.model');
const AuditLog = require('../models/AuditLog.model');

const authMiddleware = require('../modules/auth/auth.middleware');
const origProtect = authMiddleware.protect;
const origRestrictTo = authMiddleware.restrictTo;

// Find route handlers directly from the express router stack
function findHandler(router, method, path) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method.toLowerCase()]) {
      const handlers = layer.route.stack;
      return handlers[handlers.length - 1].handle;
    }
  }
  throw new Error(`Route ${method} ${path} not found`);
}

test('Super Admin routes testing', async (t) => {
  const getSessions = findHandler(superAdminRoutes, 'get', '/sessions');
  const deleteSession = findHandler(superAdminRoutes, 'delete', '/sessions/:id');

  await t.test('GET /sessions returns active sessions', async () => {
    const origFind = User.find;
    User.find = () => ({
      select: () => ({
        sort: async () => [{ name: 'Test', activeSessionId: 'sess123' }]
      })
    });

    let resBody = null;
    const req = {};
    const res = { json: (body) => { resBody = body; } };
    
    await getSessions(req, res);
    assert.equal(resBody.success, true);
    assert.equal(resBody.data[0].activeSessionId, 'sess123');

    User.find = origFind;
  });

  await t.test('DELETE /sessions/:id - valid termination writes audit log', async () => {
    const origUpdate = User.findByIdAndUpdate;
    const origCreate = AuditLog.create;

    User.findByIdAndUpdate = () => ({
      select: async () => ({ name: 'Test', activeSessionId: null, email: 'test@example.com', role: 'ADMIN', _id: '507f1f77bcf86cd799439011' })
    });

    let createdAuditLog = null;
    AuditLog.create = async (data) => {
      createdAuditLog = data;
    };

    let resBody = null;
    const req = {
      params: { id: '507f1f77bcf86cd799439011' },
      user: { sub: 'super_admin_id', name: 'Super Admin' },
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' }
    };
    const res = {
      status: (code) => res,
      json: (body) => { resBody = body; }
    };

    await deleteSession(req, res);
    assert.equal(resBody.success, true);
    assert.equal(resBody.data.activeSessionId, null);
    assert.equal(createdAuditLog.action, 'TERMINATE_SESSION');
    assert.equal(createdAuditLog.performedBy, 'super_admin_id');

    User.findByIdAndUpdate = origUpdate;
    AuditLog.create = origCreate;
  });

  await t.test('DELETE /sessions/:id - invalid id gets 400', async () => {
    let resBody = null;
    let resStatus = 200;
    const req = { params: { id: 'not_an_object_id' } };
    const res = {
      status: (code) => { resStatus = code; return res; },
      json: (body) => { resBody = body; }
    };

    await deleteSession(req, res);
    assert.equal(resStatus, 400);
    assert.equal(resBody.message, 'Invalid User ID format');
  });

  await t.test('DELETE /sessions/:id - missing user gets 404', async () => {
    const origUpdate = User.findByIdAndUpdate;
    User.findByIdAndUpdate = () => ({
      select: async () => null // not found
    });

    let resBody = null;
    let resStatus = 200;
    const req = { params: { id: '507f1f77bcf86cd799439011' } };
    const res = {
      status: (code) => { resStatus = code; return res; },
      json: (body) => { resBody = body; }
    };

    await deleteSession(req, res);
    assert.equal(resStatus, 404);
    assert.equal(resBody.message, 'User not found');

    User.findByIdAndUpdate = origUpdate;
  });

  await t.test('DELETE /sessions/:id - unexpected error returns generic 500', async () => {
    const origUpdate = User.findByIdAndUpdate;
    User.findByIdAndUpdate = () => {
      throw new Error('Some internal DB explosion containing sensitive info');
    };

    let resBody = null;
    let resStatus = 200;
    const req = { params: { id: '507f1f77bcf86cd799439011' } };
    const res = {
      status: (code) => { resStatus = code; return res; },
      json: (body) => { resBody = body; }
    };

    const origConsoleError = console.error;
    let loggedMessage = '';
    console.error = (msg, err) => { loggedMessage = msg + err; };

    await deleteSession(req, res);
    
    console.error = origConsoleError;

    assert.equal(resStatus, 500);
    assert.equal(resBody.message, 'Internal server error'); // Generic!
    assert.match(loggedMessage, /internal DB explosion/i);

    User.findByIdAndUpdate = origUpdate;
  });

  await t.test('Non-super-admin gets 403 when hitting route', async () => {
    let resStatus = 200;
    let resBody = null;
    const req = { user: { role: 'ADMIN', sub: 'user_123' } };
    const res = {
      status: (code) => { resStatus = code; return res; },
      json: (body) => { resBody = body; }
    };
    
    const middleware = origRestrictTo('SUPER_ADMIN');
    middleware(req, res, () => {
      throw new Error('Should not call next()');
    });
    
    assert.equal(resStatus, 403);
    assert.match(resBody.message, /Access denied/);
  });
});
