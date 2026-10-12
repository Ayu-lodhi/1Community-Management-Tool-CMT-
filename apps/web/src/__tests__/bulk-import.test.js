import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

// Exercise the page's actual parser without loading React or browser globals.
const source = readFileSync(new URL('../pages.jsx', import.meta.url), 'utf8');
const parser = source.match(/  const parseCSV = \(text\) => \{[\s\S]*?\n  \};/);
assert.ok(parser, 'BulkImportPage parser must be available');

function parse(emails) {
  const text = 'name,email,phone,role\n' + emails.map(email =>
    `Test User,${email},,T1_VOLUNTEER`).join('\n');
  // A VM deadline can interrupt a synchronous regex regression; a test timer cannot.
  const result = vm.runInNewContext(`${parser[0]}\nparseCSV(text);`, { text }, { timeout: 1000 });
  return JSON.parse(JSON.stringify(result));
}

test('normal CSV emails remain eligible for import', () => {
  const emails = ['user@example.com', 'first.last+tag@sub.example.co.uk', ' USER@EXAMPLE.COM '];
  const { rows, errs } = parse(emails);
  assert.deepEqual(errs, []);
  assert.deepEqual(rows.map(row => row.email), emails.map(email => email.trim()));
  assert.ok(rows.every(row => row._errors.length === 0));
});

test('missing and malformed emails are excluded while valid rows survive', () => {
  const invalid = ['', 'user', 'user@example', '@example.com', 'user@.com',
    'user@example.', 'user@sub..example.com', 'user@@example.com',
    'user@example.com@evil.com', 'user name@example.com', 'user@exam\tple.com'];
  const { rows, errs } = parse([...invalid, 'ok@example.com']);
  assert.equal(errs.length, invalid.length);
  assert.deepEqual(rows[0]._errors, ['Missing email']);
  assert.ok(rows.slice(1, -1).every(row => row._errors.includes('Invalid email')));
  assert.deepEqual(rows.filter(row => row._errors.length === 0).map(row => row.email), ['ok@example.com']);
  assert.deepEqual(errs.map(error => error.line), invalid.map((_, i) => i + 2));
});

test('email length boundary accepts 254 characters and rejects 255', () => {
  const domain = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
  const email = `${'a'.repeat(64)}@${domain}`;
  assert.equal(email.length, 254);
  const { rows } = parse([email, `${email}d`]);
  assert.deepEqual(rows[0]._errors, []);
  assert.deepEqual(rows[1]._errors, ['Invalid email']);
});

test('adversarial CSV email fields finish within a bounded execution deadline', () => {
  const { rows, errs } = parse([
    'a@'.repeat(30000),
    'a'.repeat(60000),
    `user@${'a.'.repeat(30000)} `,
    'a@'.repeat(126),
    `user@${'a.'.repeat(123)}`,
  ]);
  assert.equal(errs.length, rows.length);
  assert.ok(rows.every(row => row._errors.includes('Invalid email')));
});
