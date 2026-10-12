const test = require('node:test');
const assert = require('node:assert/strict');
const { envSchema } = require('../envValidation');

test('Environment Validation - accepts valid environment variables', () => {
  const validEnv = {
    NODE_ENV: 'test',
    PORT: 5000,
    CLIENT_URL: 'http://localhost:5173',
    MONGODB_URI: 'mongodb://localhost:27017/test_db',
    REDIS_CACHE_URL: 'redis://localhost:6379/0',
    REDIS_PUBSUB_URL: 'redis://localhost:6380/1',
    REDIS_QUEUE_URL: 'redis://localhost:6381/2',
    JWT_ACCESS_SECRET: 'super_secret_access_token_key_12345',
    JWT_REFRESH_SECRET: 'super_secret_refresh_token_key_12345',
  };

  const { error, value } = envSchema.validate(validEnv);
  assert.equal(error, undefined);
  assert.equal(value.PORT, 5000);
});

test('Environment Validation - fails when required secret or connection URI is missing', () => {
  const invalidEnv = {
    NODE_ENV: 'test',
    // Missing MONGODB_URI and JWT_ACCESS_SECRET
    REDIS_CACHE_URL: 'redis://localhost:6379/0',
    REDIS_PUBSUB_URL: 'redis://localhost:6380/1',
    REDIS_QUEUE_URL: 'redis://localhost:6381/2',
  };

  const { error } = envSchema.validate(invalidEnv, { abortEarly: false });
  assert.ok(error);

  const missingKeys = error.details.map((d) => d.context?.key);
  assert.ok(missingKeys.includes('MONGODB_URI'));
  assert.ok(missingKeys.includes('JWT_ACCESS_SECRET'));

  // Ensure secret values are never printed in error messages
  const errorString = JSON.stringify(error.details);
  assert.equal(errorString.includes('super_secret'), false);
});
