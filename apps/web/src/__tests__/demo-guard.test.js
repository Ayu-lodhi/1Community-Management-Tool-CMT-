import test from 'node:test';
import assert from 'node:assert/strict';
import { guardProductionDemoEnv } from '../envGuard.js';
import { validateNoDemoEnvInProduction } from '../../vite.config.js';

test('guardProductionDemoEnv: allows execution in development even if demo env vars exist', () => {
  const devEnv = {
    DEV: true,
    PROD: false,
    VITE_DEMO_SUPER_EMAIL: 'super@example.com',
    VITE_DEMO_SUPER_PASSWORD: 'password123',
  };
  assert.doesNotThrow(() => guardProductionDemoEnv(devEnv));
});

test('guardProductionDemoEnv: allows execution in production when demo env vars are unset or empty', () => {
  const prodEnv = {
    DEV: false,
    PROD: true,
    VITE_API_BASE_URL: 'https://api.example.com',
    VITE_DEMO_SUPER_EMAIL: '',
    VITE_DEMO_SUPER_PASSWORD: '',
  };
  assert.doesNotThrow(() => guardProductionDemoEnv(prodEnv));
});

test('guardProductionDemoEnv: throws and logs fatal error in production when VITE_DEMO_* is set', () => {
  const prodEnv = {
    DEV: false,
    PROD: true,
    VITE_DEMO_SUPER_EMAIL: 'super@example.com',
  };
  assert.throws(
    () => guardProductionDemoEnv(prodEnv),
    /\[SECURITY FATAL\].*VITE_DEMO_SUPER_EMAIL/
  );
});

test('guardProductionDemoEnv: throws in production for arbitrary dynamic VITE_DEMO_* vars', () => {
  const prodEnv = {
    DEV: false,
    PROD: true,
    VITE_DEMO_CUSTOM_SECRET: 'secret',
  };
  assert.throws(
    () => guardProductionDemoEnv(prodEnv),
    /\[SECURITY FATAL\].*VITE_DEMO_CUSTOM_SECRET/
  );
});

test('validateNoDemoEnvInProduction: throws in production mode when demo env vars are present in environment', () => {
  const prevEnv = process.env.VITE_DEMO_SUPER_EMAIL;
  try {
    process.env.VITE_DEMO_SUPER_EMAIL = 'super@example.com';
    assert.throws(
      () => validateNoDemoEnvInProduction('production'),
      /\[SECURITY FATAL\].*VITE_DEMO_SUPER_EMAIL/
    );
  } finally {
    if (prevEnv === undefined) {
      delete process.env.VITE_DEMO_SUPER_EMAIL;
    } else {
      process.env.VITE_DEMO_SUPER_EMAIL = prevEnv;
    }
  }
});

test('validateNoDemoEnvInProduction: allows development mode even with demo env vars', () => {
  const prevEnv = process.env.VITE_DEMO_SUPER_EMAIL;
  try {
    process.env.VITE_DEMO_SUPER_EMAIL = 'super@example.com';
    assert.doesNotThrow(() => validateNoDemoEnvInProduction('development'));
  } finally {
    if (prevEnv === undefined) {
      delete process.env.VITE_DEMO_SUPER_EMAIL;
    } else {
      process.env.VITE_DEMO_SUPER_EMAIL = prevEnv;
    }
  }
});
