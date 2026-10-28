const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const healthController = require('../modules/health/health.controller');

test('Health Check MongoDB Connection URI Handling', async (t) => {
  const origConnect = mongoose.connect;
  const origReadyState = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');

  t.afterEach(() => {
    mongoose.connect = origConnect;
    if (origReadyState) {
      Object.defineProperty(mongoose.connection, 'readyState', origReadyState);
    }
  });

  await t.test('connects using unmodified MONGODB_URI without hardcoded shard rewrites', async () => {
    const testUri = 'mongodb+srv://user:pass@ac-gkiqwag-shard-00-00.customcluster.mongodb.net/custom_db?retryWrites=true&w=majority';
    process.env.MONGODB_URI = testUri;

    let connectedUri = null;
    mongoose.connect = async (uri) => {
      connectedUri = uri;
      return mongoose;
    };

    Object.defineProperty(mongoose.connection, 'readyState', {
      value: 0,
      configurable: true,
    });

    const req = {};
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.data = payload;
        return this;
      },
    };

    await healthController.getHealth(req, res);

    assert.strictEqual(
      connectedUri,
      testUri,
      'Health check should use process.env.MONGODB_URI directly without hardcoded shard replacements'
    );
  });
});
