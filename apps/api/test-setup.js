// Central test setup for apps/api tests
process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) {
  process.env.JWT_ACCESS_SECRET = 'test_access_jwt_secret_min_32_characters_long';
}
if (!process.env.JWT_REFRESH_SECRET) {
  process.env.JWT_REFRESH_SECRET = 'test_refresh_jwt_secret_min_32_characters_long';
}
