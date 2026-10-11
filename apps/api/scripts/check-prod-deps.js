#!/usr/bin/env node
/**
 * scripts/check-prod-deps.js
 *
 * CI / Docker build verification script.
 * Verifies that devDependencies are strictly omitted in production images and builds.
 */

const path = require('path');
const fs = require('fs');

const apiRoot = path.resolve(__dirname, '..');
const pkgPath = path.join(apiRoot, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const devDeps = Object.keys(pkg.devDependencies || {});

if (devDeps.length === 0) {
  console.log('✅ No devDependencies listed in package.json.');
  process.exit(0);
}

const leaked = [];

for (const dep of devDeps) {
  try {
    require.resolve(dep, { paths: [apiRoot] });
    leaked.push(dep);
  } catch {
    // Expected: devDependency cannot be resolved when installed with --omit=dev
  }
}

const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--strict');

if (leaked.length > 0) {
  if (isProduction) {
    console.error('❌ CI/Docker Check Failed: devDependencies detected in production environment:');
    leaked.forEach((dep) => console.error(`   - ${dep}`));
    console.error('\nEnsure production builds use "npm ci --omit=dev" or "NODE_ENV=production".');
    process.exit(1);
  } else {
    console.log(`ℹ️ Development environment detected: ${leaked.length} devDependencies found (${leaked.join(', ')}).`);
    console.log('Pass --strict or set NODE_ENV=production to enforce production gating.');
    process.exit(0);
  }
}

console.log(`✅ Production Dependency Check Passed: 0 of ${devDeps.length} devDependencies found in environment.`);
process.exit(0);
