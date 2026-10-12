#!/usr/bin/env node
// scripts/dump-routes.js
// Prints every registered Express route (method + path + middleware names) to stdout.
// Usage: node scripts/dump-routes.js > docs/routes-before.txt
// Note: requires NODE_ENV=test so the server skips env validation and does not listen.

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dump_routes_placeholder_32_chars__';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dump_routes_access_placeholder_32c';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dump_routes_refresh_placeholder_32';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dump_test_db';
process.env.REDIS_CACHE_URL = process.env.REDIS_CACHE_URL || 'redis://127.0.0.1:6379/0';
process.env.REDIS_QUEUE_URL = process.env.REDIS_QUEUE_URL || 'redis://127.0.0.1:6381/2';
process.env.REDIS_PUBSUB_URL = process.env.REDIS_PUBSUB_URL || 'redis://127.0.0.1:6380/1';

const mongoose = require('mongoose');
// Prevent server.js from trying to connect to remote MongoDB Atlas and satisfy model compilation
mongoose.connection.readyState = 1;
mongoose.connection.db = {
  collection: () => ({
    createIndex: () => Promise.resolve(),
    indexes: () => Promise.resolve([]),
  }),
};

const app = require('../apps/api/src/server');

function getMiddlewareNames(layer) {
  if (!layer) return [];
  const names = [];
  if (layer.handle && layer.handle.name) {
    names.push(layer.handle.name || '<anonymous>');
  }
  if (layer.handle && layer.handle.stack) {
    layer.handle.stack.forEach((sub) => names.push(...getMiddlewareNames(sub)));
  }
  return names;
}

function extractRoutes(stack, basePath = '') {
  const routes = [];
  if (!stack) return routes;

  stack.forEach((layer) => {
    if (layer.route) {
      // It's a route
      const methods = Object.keys(layer.route.methods)
        .filter((m) => layer.route.methods[m])
        .map((m) => m.toUpperCase());

      const mwNames = (layer.route.stack || [])
        .map((l) => l.handle?.name || '<anonymous>')
        .filter((n) => n !== 'bound dispatch');

      methods.forEach((method) => {
        routes.push(`${method.padEnd(7)} ${basePath}${layer.route.path}  [${mwNames.join(', ')}]`);
      });
    } else if (layer.name === 'router' && layer.handle.stack) {
      // It's a sub-router — get the path prefix
      let prefix = '';
      if (layer.regexp && layer.regexp.source !== '^\\/?$' && layer.regexp.source !== '^\\/?(?=\\/|$)') {
        // Attempt to reconstruct path from regexp keys
        prefix = basePath;
      }
      if (layer.regexp && layer.keys && layer.keys.length === 0) {
        const src = layer.regexp.source
          .replace('^\\/','/')
          .replace('\\/?(?=\\/|$)', '')
          .replace('(?:\\/(?=$))?$', '')
          .replace(/\\\//g, '/');
        prefix = basePath + src;
      }
      routes.push(...extractRoutes(layer.handle.stack, prefix || basePath));
    }
  });

  return routes;
}

const routes = extractRoutes(app._router.stack);
routes.sort();
routes.forEach((r) => console.log(r));
console.log(`\nTotal routes: ${routes.length}`);

process.exit(0);
