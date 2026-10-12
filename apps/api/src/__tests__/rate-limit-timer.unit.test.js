const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

test('Rate limit pruning timer does not keep process alive', async (t) => {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['-e', "require('./apps/api/src/middleware/rateLimit.middleware.js')"], {
      env: { PATH: process.env.PATH, NODE_ENV: 'test' },
      cwd: path.resolve(__dirname, '../../../../')
    });

    let exited = false;
    child.on('exit', (code) => {
      exited = true;
      assert.strictEqual(code, 0, 'Process should exit cleanly with code 0');
      resolve();
    });

    setTimeout(() => {
      if (!exited) {
        child.kill();
        reject(new assert.AssertionError({ message: 'Process did not exit within 5 seconds. Timer likely keeping it alive.' }));
      }
    }, 5000).unref();
  });
});
