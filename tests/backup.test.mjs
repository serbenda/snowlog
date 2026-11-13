import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../public/js/crypto.js';
import { makeBackup, openBackup, parseBackup } from '../public/js/backup.js';
import { makeZip, readZip } from '../public/js/zip.js';

const ITER = 1000;

test('readZip lee lo que escribe makeZip y detecta corrupción', () => {
  const files = [{ path: 'Diario/2026-11-13.md', text: '# Viernes ñ' }, { path: 'Adjuntos/foto.png', data: new Uint8Array([1, 2, 3]) }];
  const zip = makeZip(files);
  const back = readZip(zip);
  assert.deepEqual(back.map((f) => f.path), ['Diario/2026-11-13.md', 'Adjuntos/foto.png']);
  assert.equal(new TextDecoder().decode(back[0].data), '# Viernes ñ');
  assert.deepEqual(back[1].data, new Uint8Array([1, 2, 3]));
  const bad = zip.slice();
  bad[52] ^= 0xff; // dentro del contenido del primer fichero
  assert.throws(() => readZip(bad), /bad_zip/);
  assert.throws(() => readZip(new Uint8Array(10)), /bad_zip/);
});

test('la copia se abre con la frase o con el código de recuperación, y no lleva nada en claro', async () => {
  const { vault, dek, recoveryCode } = await C.createVault('frase de paso de prueba', ITER);
  const files = [{ path: 'Secretos/Plan.md', text: 'contenido muy secreto' }, { path: 'Adjuntos/foto.png', data: new Uint8Array([9, 9]) }];
  const bytes = await makeBackup(vault, dek, files, new Date('2026-11-13T10:00:00Z'));
  const raw = new TextDecoder().decode(bytes);
  for (const w of ['Secretos', 'Plan', 'secreto', 'foto']) assert.ok(!raw.includes(w), w);
  const meta = parseBackup(bytes);
  assert.equal(meta.notes, 1);
  assert.equal(meta.files, 2);
  const a = await openBackup(bytes, 'frase de paso de prueba');
  assert.equal(a.created, '2026-11-13T10:00:00.000Z');
  assert.equal(new TextDecoder().decode(a.files[0].data), 'contenido muy secreto');
  const b = await openBackup(bytes, recoveryCode.toLowerCase());
  assert.equal(b.files.length, 2);
  await assert.rejects(openBackup(bytes, 'otra frase'), /bad_secret/);
  await assert.rejects(openBackup(new TextEncoder().encode('{"app":"x"}'), 'x'), /bad_backup/);
  const tampered = JSON.parse(raw);
  tampered.data = tampered.data.slice(0, -8) + 'AAAAAAA=';
  await assert.rejects(openBackup(new TextEncoder().encode(JSON.stringify(tampered)), 'frase de paso de prueba'), /bad_backup/);
});
