// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../public/js/crypto.js';
import { makeBackup, openBackup, parseBackup } from '../public/js/backup.js';
import { makeZip, readZip } from '../public/js/zip.js';

const ITER = 1000;

test('readZip reads what makeZip writes and detects corruption', () => {
  const files = [{ path: 'Daily/2026-11-13.md', text: '# Friday ñ' }, { path: 'Attachments/photo.png', data: new Uint8Array([1, 2, 3]) }];
  const zip = makeZip(files);
  const back = readZip(zip);
  assert.deepEqual(back.map((f) => f.path), ['Daily/2026-11-13.md', 'Attachments/photo.png']);
  assert.equal(new TextDecoder().decode(back[0].data), '# Friday ñ');
  assert.deepEqual(back[1].data, new Uint8Array([1, 2, 3]));
  const bad = zip.slice();
  bad[52] ^= 0xff; // inside the content of the first file
  assert.throws(() => readZip(bad), /bad_zip/);
  assert.throws(() => readZip(new Uint8Array(10)), /bad_zip/);
});

test('the backup opens with the passphrase or the recovery code, and holds nothing in plaintext', async () => {
  const { vault, dek, recoveryCode } = await C.createVault('test passphrase', ITER);
  const files = [{ path: 'Secrets/Plan.md', text: 'very secret content' }, { path: 'Attachments/photo.png', data: new Uint8Array([9, 9]) }];
  const bytes = await makeBackup(vault, dek, files, new Date('2026-11-13T10:00:00Z'));
  const raw = new TextDecoder().decode(bytes);
  for (const w of ['Secrets', 'Plan', 'secret', 'photo']) assert.ok(!raw.includes(w), w);
  const meta = parseBackup(bytes);
  assert.equal(meta.notes, 1);
  assert.equal(meta.files, 2);
  const a = await openBackup(bytes, 'test passphrase');
  assert.equal(a.created, '2026-11-13T10:00:00.000Z');
  assert.equal(new TextDecoder().decode(a.files[0].data), 'very secret content');
  const b = await openBackup(bytes, recoveryCode.toLowerCase());
  assert.equal(b.files.length, 2);
  await assert.rejects(openBackup(bytes, 'other passphrase'), /bad_secret/);
  await assert.rejects(openBackup(new TextEncoder().encode('{"app":"x"}'), 'x'), /bad_backup/);
  const tampered = JSON.parse(raw);
  tampered.data = tampered.data.slice(0, -8) + 'AAAAAAA=';
  await assert.rejects(openBackup(new TextEncoder().encode(JSON.stringify(tampered)), 'test passphrase'), /bad_backup/);
});
