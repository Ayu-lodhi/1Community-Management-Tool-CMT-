const assert = require('node:assert/strict');
const { test } = require('node:test');
const bcrypt = require('bcryptjs');
const User = require('../../admin/admin.model');
const admin = require('../../admin/admin.service');
const auth = require('../auth.service');
const repository = require('../auth.repository');
const tokens = require('../auth.tokens');

for (const flow of ['change', 'temporary replacement', 'admin set']) {
  test(`${flow} enforces the bcrypt UTF-8 byte boundary`, async (t) => {
    const oldPassword = 'Old-password1!';
    const originalHash = await bcrypt.hash(oldPassword, 4);
    const user = {
      _id: '111111111111111111111111', role: 'T1_VOLUNTEER', isActive: true,
      password: originalHash, mustChangePassword: flow === 'temporary replacement',
      passwordChangeStartedAt: flow === 'temporary replacement' ? new Date() : null,
      toObject() { return { ...this }; },
      async save() {},
    };
    t.mock.method(repository, 'findById', async () => user);
    t.mock.method(User, 'findById', async () => user);
    const replace = t.mock.method(repository, 'replacePassword', async (_, hash) => {
      user.password = hash;
      return user;
    });
    const save = t.mock.method(user, 'save');
    const hash = t.mock.method(bcrypt, 'hash');
    const setPassword = (password) => flow === 'admin set'
      ? admin.setPassword(user._id, password, '222222222222222222222222')
      : auth.changePassword({ sub: user._id, authState: tokens.authState(user),
        purpose: user.mustChangePassword ? 'password-change' : 'access' }, oldPassword, password);

    await t.test('rejects overlong ASCII, multibyte and emoji input before hashing or writing', async () => {
      for (const password of [
        'a'.repeat(72) + 'A1!', // Required classes only exist in the discarded suffix.
        'Aa1!' + 'b'.repeat(69), // 73 ASCII bytes.
        'Aa1!' + 'é'.repeat(34) + 'b', // 73 bytes, only 39 UTF-16 code units.
        'Aa1!' + '😀'.repeat(17) + 'b', // 73 bytes with surrogate pairs.
        'a'.repeat(73), // Byte limit must precede composition validation.
      ]) {
        assert.ok(Buffer.byteLength(password, 'utf8') > 72);
        await assert.rejects(setPassword(password), /Password must not exceed 72 UTF-8 bytes/);
        assert.equal(user.password, originalHash);
        // Verifying the old password also calls bcrypt.hash internally.
        assert.ok(hash.mock.calls.every(({ arguments: args }) => args[0] === oldPassword));
        assert.equal(replace.mock.callCount(), 0);
        assert.equal(save.mock.callCount(), 0);
      }
    });

    await t.test('accepts 71 and 72 bytes and hashes the full credential', async () => {
      for (const password of [
        'Aa1!' + 'b'.repeat(67), 'Aa1!' + 'b'.repeat(68),
        'Aa1!' + 'é'.repeat(33) + 'b', 'Aa1!' + 'é'.repeat(34),
        'Aa1!' + '😀'.repeat(17),
      ]) {
        user.password = originalHash;
        assert.ok([71, 72].includes(Buffer.byteLength(password, 'utf8')));
        await setPassword(password);
        assert.equal(bcrypt.getRounds(user.password), 12);
        assert.equal(await bcrypt.compare(password, user.password), true);
        assert.equal(await bcrypt.compare(Array.from(password).slice(0, -1).join(''), user.password), false);
      }
    });

    await t.test('retains type, minimum length and composition validation', async () => {
      for (const password of [null, 12345678, {}, ['Password1!'], 'Aa1!',
        'lowercase1!', 'UPPERCASE1!', 'NoNumbers!', 'NoSpecial1']) {
        user.password = originalHash;
        await assert.rejects(setPassword(password), /Password must/);
      }
    });
  });
}
