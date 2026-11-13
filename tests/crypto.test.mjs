import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../public/js/crypto.js';

const ITER = 1000; // bajo solo para que los tests sean rápidos

test('cifrar y descifrar texto ida y vuelta', async () => {
  const { dek } = await C.createVault('una frase de paso larga', ITER);
  const text = 'Hola, ñandú 🐧 — notas secretas';
  const ct = await C.encryptText(dek, text, 'id1');
  assert.notEqual(ct, text);
  assert.ok(!ct.includes('Hola'));
  assert.equal(await C.decryptText(dek, ct, 'id1'), text);
});

test('el mismo texto cifra distinto cada vez (IV nuevo)', async () => {
  const { dek } = await C.createVault('una frase de paso larga', ITER);
  assert.notEqual(await C.encryptText(dek, 'x', 'a'), await C.encryptText(dek, 'x', 'a'));
});

test('cambiar el fichero de sitio (otro AAD) hace fallar el descifrado', async () => {
  const { dek } = await C.createVault('una frase de paso larga', ITER);
  const ct = await C.encryptText(dek, 'secreto', 'nota-a');
  await assert.rejects(C.decryptText(dek, ct, 'nota-b'));
});

test('desbloquear con la frase correcta y rechazar la incorrecta', async () => {
  const { vault, dek } = await C.createVault('frase correcta de prueba', ITER);
  const ct = await C.encryptText(dek, 'dato', 'k');
  const dek2 = await C.unlockVault(vault, 'frase correcta de prueba');
  assert.equal(await C.decryptText(dek2, ct, 'k'), 'dato');
  await assert.rejects(C.unlockVault(vault, 'frase incorrecta'), /bad_secret/);
});

test('vault.json no contiene la clave en claro', async () => {
  const { vault } = await C.createVault('frase correcta de prueba', ITER);
  assert.deepEqual(Object.keys(vault.keys).sort(), ['passphrase', 'recovery']);
  assert.equal(vault.keys.passphrase.kdf.iterations, ITER);
  assert.equal(C.fromB64(vault.keys.passphrase.wrapped).length, 12 + 32 + 16);
});

test('el código de recuperación permite fijar una frase nueva', async () => {
  const { vault, dek, recoveryCode } = await C.createVault('frase antigua de prueba', ITER);
  assert.match(recoveryCode, /^[A-Z2-9]{5}(-[A-Z2-9]{5}){4}$/);
  const ct = await C.encryptText(dek, 'dato', 'k');
  const { vault: updated } = await C.recoverVault(vault, recoveryCode.toLowerCase().replace(/-/g, ' '), 'frase nueva de prueba');
  const dek2 = await C.unlockVault(updated, 'frase nueva de prueba');
  assert.equal(await C.decryptText(dek2, ct, 'k'), 'dato');
  await assert.rejects(C.unlockVault(updated, 'frase antigua de prueba'), /bad_secret/);
  await assert.rejects(C.recoverVault(vault, 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAA', 'x'.repeat(12)), /bad_secret/);
});

test('base64 aguanta datos grandes', () => {
  const big = C.randomBytes(300000);
  assert.deepEqual(C.fromB64(C.toB64(big)), big);
});

test('cambiar la frase de paso: la nueva abre, la antigua no, y las notas siguen legibles', async () => {
  const { vault, dek } = await C.createVault('frase antigua de prueba', ITER);
  const nota = await C.encryptText(dek, 'contenido', 'n1');
  await assert.rejects(C.changePassphrase(vault, 'no es esta', 'frase nueva de prueba'), /bad_secret/);
  const updated = await C.changePassphrase(vault, 'frase antigua de prueba', 'frase nueva de prueba', ITER * 2);
  assert.equal(updated.keys.passphrase.kdf.iterations, ITER * 2);
  assert.notEqual(updated.keys.passphrase.kdf.salt, vault.keys.passphrase.kdf.salt);
  assert.deepEqual(updated.keys.recovery, vault.keys.recovery, 'el código de recuperación sigue igual');
  await assert.rejects(C.unlockVault(updated, 'frase antigua de prueba'), /bad_secret/);
  const dek2 = await C.unlockVault(updated, 'frase nueva de prueba');
  assert.equal(await C.decryptText(dek2, nota, 'n1'), 'contenido');
  assert.equal(vault.keys.passphrase.kdf.iterations, ITER, 'no modifica el original');
});

test('generar un código de recuperación nuevo invalida el anterior', async () => {
  const { vault, recoveryCode } = await C.createVault('frase de paso de prueba', ITER);
  await assert.rejects(C.renewRecoveryCode(vault, 'mal', ITER), /bad_secret/);
  const { vault: updated, recoveryCode: nuevo } = await C.renewRecoveryCode(vault, 'frase de paso de prueba');
  assert.notEqual(nuevo, recoveryCode);
  await assert.rejects(C.recoverVault(updated, recoveryCode, 'otra frase nueva'), /bad_secret/);
  const { dek } = await C.recoverVault(updated, nuevo, 'otra frase nueva');
  assert.ok(dek);
  assert.deepEqual(updated.keys.passphrase, vault.keys.passphrase);
});
