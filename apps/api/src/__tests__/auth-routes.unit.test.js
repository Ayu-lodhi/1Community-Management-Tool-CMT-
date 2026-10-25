const { test } = require('node:test');
const assert = require('node:assert');
const authRoutes = require('../modules/auth/auth.routes');

test('POST /login route middleware stack', () => {
  const loginRoute = authRoutes.stack.find(
    (layer) => layer.route && layer.route.path === '/login' && layer.route.methods.post
  );
  assert.ok(loginRoute, 'POST /login route should exist');
  
  const middlewareNames = loginRoute.route.stack.map(s => s.name);
  
  // verifyCaptcha must be present
  const verifyCaptchaIndex = middlewareNames.indexOf('verifyCaptcha');
  
  assert.ok(verifyCaptchaIndex !== -1, 'verifyCaptcha should be in the stack');
  assert.strictEqual(verifyCaptchaIndex, 0, 'verifyCaptcha must come first');
  
  // loginLimiter must NOT be present
  const loginLimiterIndex = middlewareNames.indexOf('loginLimiter');
  assert.strictEqual(loginLimiterIndex, -1, 'loginLimiter should not be present');
});

test('POST /forgot-password route exists and has rate limiting', () => {
  const forgotRoute = authRoutes.stack.find(
    (layer) => layer.route && layer.route.path === '/forgot-password' && layer.route.methods.post
  );
  assert.ok(forgotRoute, 'POST /forgot-password route should exist');
  assert.equal(forgotRoute.route.stack.length >= 2, true, 'Route must have rate limiter and controller');
});

test('Public /captcha and sensitive auth routes have rate limiting attached', () => {
  const captchaRoute = authRoutes.stack.find(
    (layer) => layer.route && layer.route.path === '/captcha' && layer.route.methods.get
  );
  assert.ok(captchaRoute, 'GET /captcha route should exist');
  assert.equal(captchaRoute.route.stack.length >= 2, true, 'GET /captcha must have rate limiting attached');

  const mfaRoute = authRoutes.stack.find(
    (layer) => layer.route && layer.route.path === '/mfa/verify' && layer.route.methods.post
  );
  assert.ok(mfaRoute, 'POST /mfa/verify route should exist');
  assert.equal(mfaRoute.route.stack.length >= 2, true, 'POST /mfa/verify must have rate limiting attached');

  const changeEmailRoute = authRoutes.stack.find(
    (layer) => layer.route && layer.route.path === '/change-email' && layer.route.methods.post
  );
  assert.ok(changeEmailRoute, 'POST /change-email route should exist');
  assert.equal(changeEmailRoute.route.stack.length >= 3, true, 'POST /change-email must have protect, rate limiter, and controller');
});
