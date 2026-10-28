// Central test setup for apps/api tests
process.env.NODE_ENV = 'test';
process.env.ALLOW_NO_REDIS = 'true';
process.env.USE_WORKER_QUEUES = 'false';
if (!process.env.MFA_ENCRYPTION_KEY) {
  process.env.MFA_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
}
if (!process.env.JWT_ACCESS_SECRET) {
  process.env.JWT_ACCESS_SECRET = 'test_access_jwt_secret_min_32_characters_long';
}
if (!process.env.JWT_REFRESH_SECRET) {
  process.env.JWT_REFRESH_SECRET = 'test_refresh_jwt_secret_min_32_characters_long';
}
