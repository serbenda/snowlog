// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../public/js/crypto.js';

const ITER = 1000; // low only so the tests are fast

test('encrypt and decrypt text round trip', async () => {
  const { dek } = await C.createVault('a long passphrase', ITER);
  const text = 'Hello, ñandú 🐧 — secret notes';
  const ct = await C.encryptText(dek, text, 'id1');
  assert.notEqual(ct, text);
  assert.ok(!ct.includes('Hello'));
  assert.equal(await C.decryptText(dek, ct, 'id1'), text);
});

test('the same text encrypts differently each time (new IV)', async () => {
  const { dek } = await C.createVault('a long passphrase', ITER);
  assert.notEqual(await C.encryptText(dek, 'x', 'a'), await C.encryptText(dek, 'x', 'a'));
});

test('moving the file (another AAD) makes decryption fail', async () => {
  const { dek } = await C.createVault('a long passphrase', ITER);
  const ct = await C.encryptText(dek, 'secret', 'note-a');
  await assert.rejects(C.decryptText(dek, ct, 'note-b'));
});

test('unlock with the right passphrase and reject the wrong one', async () => {
  const { vault, dek } = await C.createVault('right test passphrase', ITER);
  const ct = await C.encryptText(dek, 'data', 'k');
  const dek2 = await C.unlockVault(vault, 'right test passphrase');
  assert.equal(await C.decryptText(dek2, ct, 'k'), 'data');
  await assert.rejects(C.unlockVault(vault, 'wrong passphrase'), /bad_secret/);
});

test('vault.json does not hold the key in plaintext', async () => {
  const { vault } = await C.createVault('right test passphrase', ITER);
  assert.deepEqual(Object.keys(vault.keys).sort(), ['passphrase', 'recovery']);
  assert.equal(vault.keys.passphrase.kdf.iterations, ITER);
  assert.equal(C.fromB64(vault.keys.passphrase.wrapped).length, 12 + 32 + 16);
});

test('the recovery code allows setting a new passphrase', async () => {
  const { vault, dek, recoveryCode } = await C.createVault('old test passphrase', ITER);
  assert.match(recoveryCode, /^[A-Z2-9]{5}(-[A-Z2-9]{5}){4}$/);
  const ct = await C.encryptText(dek, 'data', 'k');
  const { vault: updated } = await C.recoverVault(vault, recoveryCode.toLowerCase().replace(/-/g, ' '), 'new test passphrase');
  const dek2 = await C.unlockVault(updated, 'new test passphrase');
  assert.equal(await C.decryptText(dek2, ct, 'k'), 'data');
  await assert.rejects(C.unlockVault(updated, 'old test passphrase'), /bad_secret/);
  await assert.rejects(C.recoverVault(vault, 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAA', 'x'.repeat(12)), /bad_secret/);
});

test('base64 copes with large data', () => {
  const big = C.randomBytes(300000);
  assert.deepEqual(C.fromB64(C.toB64(big)), big);
});

test('changing the passphrase: the new one opens, the old one does not, and notes stay readable', async () => {
  const { vault, dek } = await C.createVault('old test passphrase', ITER);
  const note = await C.encryptText(dek, 'content', 'n1');
  await assert.rejects(C.changePassphrase(vault, 'not this one', 'new test passphrase'), /bad_secret/);
  const updated = await C.changePassphrase(vault, 'old test passphrase', 'new test passphrase', ITER * 2);
  assert.equal(updated.keys.passphrase.kdf.iterations, ITER * 2);
  assert.notEqual(updated.keys.passphrase.kdf.salt, vault.keys.passphrase.kdf.salt);
  assert.deepEqual(updated.keys.recovery, vault.keys.recovery, 'the recovery code stays the same');
  await assert.rejects(C.unlockVault(updated, 'old test passphrase'), /bad_secret/);
  const dek2 = await C.unlockVault(updated, 'new test passphrase');
  assert.equal(await C.decryptText(dek2, note, 'n1'), 'content');
  assert.equal(vault.keys.passphrase.kdf.iterations, ITER, 'does not modify the original');
});

test('generating a new recovery code invalidates the previous one', async () => {
  const { vault, recoveryCode } = await C.createVault('test passphrase', ITER);
  await assert.rejects(C.renewRecoveryCode(vault, 'wrong', ITER), /bad_secret/);
  const { vault: updated, recoveryCode: renewed } = await C.renewRecoveryCode(vault, 'test passphrase');
  assert.notEqual(renewed, recoveryCode);
  await assert.rejects(C.recoverVault(updated, recoveryCode, 'another new passphrase'), /bad_secret/);
  const { dek } = await C.recoverVault(updated, renewed, 'another new passphrase');
  assert.ok(dek);
  assert.deepEqual(updated.keys.passphrase, vault.keys.passphrase);
});

test('rotate: new DEK, same passphrase, new code, and the old key comes out for the keyring', async () => {
  const { vault, dek: oldDek, recoveryCode } = await C.createVault('test passphrase', ITER);
  const old = await C.encryptText(oldDek, 'before', 'n1');
  await assert.rejects(C.rotateVault(vault, 'wrong', ITER), /bad_secret/);
  const r = await C.rotateVault(vault, 'test passphrase', ITER);
  const fresh = await C.unlockVault(r.vault, 'test passphrase');
  await assert.rejects(C.decryptText(fresh, old, 'n1'), 'the new key does not open old data');
  assert.equal(await C.decryptText(await C.importKey(r.oldKey), old, 'n1'), 'before');
  await assert.rejects(C.recoverVault(r.vault, recoveryCode, 'another new passphrase'), /bad_secret/);
  assert.ok((await C.recoverVault(r.vault, r.recoveryCode, 'another new passphrase')).dek);
  assert.ok(r.vault.rotated);
  assert.ok(!JSON.stringify(r.vault).includes(r.oldKey));
});
