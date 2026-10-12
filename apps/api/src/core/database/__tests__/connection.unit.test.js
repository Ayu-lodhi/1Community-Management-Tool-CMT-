import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_ACCESS_SECRET = 'mock-secret';
process.env.JWT_REFRESH_SECRET = 'mock-secret';
process.env.REDIS_CACHE_URL = 'redis://';
process.env.REDIS_PUBSUB_URL = 'redis://';
process.env.REDIS_QUEUE_URL = 'redis://';

const { connectDB } = await import('../connection.js');

test('Database Connection Options from Env Vars', async (t) => {
  const originalEnv = { ...process.env };
  const origConnect = mongoose.connect;
  let lastConnectOptions = null;

  mongoose.connect = async (uri, options) => {
    lastConnectOptions = options;
    return { connection: { host: 'mock-host' } };
  };

  t.afterEach(() => {
    process.env = { ...originalEnv };
  });

  t.after(() => {
    mongoose.connect = origConnect;
  });

  await t.test('Uses default options when no env vars provided', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DB_TLS_CA_FILE;
    delete process.env.DB_REPLICA_SET;
    delete process.env.DB_RETRY_WRITES;
    delete process.env.DB_MAX_POOL_SIZE;
    delete process.env.DB_READ_PREFERENCE;

    const origExit = process.exit;
    process.exit = () => {};
    await connectDB();
    process.exit = origExit;
    assert.deepEqual(lastConnectOptions, { autoIndex: false });
  });

  await t.test('Parses and passes DB override env vars', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DB_TLS_CA_FILE = 'global-bundle.pem';
    process.env.DB_REPLICA_SET = 'rs0';
    process.env.DB_RETRY_WRITES = 'false';
    process.env.DB_MAX_POOL_SIZE = '50';
    process.env.DB_READ_PREFERENCE = 'secondaryPreferred';

    await connectDB();
    assert.deepEqual(lastConnectOptions, {
      autoIndex: true,
      tls: true,
      tlsCAFile: 'global-bundle.pem',
      replicaSet: 'rs0',
      retryWrites: false,
      maxPoolSize: 50,
      readPreference: 'secondaryPreferred'
    });
  });
});
