import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openKvDir, memoryBackend } from '../public/js/kvdir.js';
import { LocalVault } from '../public/js/localvault.js';

test('Firefox and Safari: notes are stored inside the browser and are still there on return', async () => {
  const backend = memoryBackend();
  const root = await openKvDir(backend);
  const v = await new LocalVault(root, { kind: 'memory', label: 'this browser' }).load();
  const a = await v.createNote('Daily/2026-11-13', '# Friday ñ');
  await v.createNote('Ideas', 'idea');
  await v.saveNote(a, '# Friday ñ\nmore');
  await v.addFile('Attachments', 'photo.png', new Uint8Array([137, 80, 78, 71, 1, 2, 3]));
  await v.createFolder('Empty');
  await v.deleteNote(v.findByTitle('Ideas').id);
  await root.flush();

  const again = await new LocalVault(await openKvDir(backend), { kind: 'memory' }).load();
  assert.deepEqual(again.notes().map((n) => n.path), ['Daily/2026-11-13']);
  assert.equal(await again.read(again.findByTitle('2026-11-13').id), '# Friday ñ\nmore');
  assert.deepEqual(await again.readFile(again.findFile('photo.png').id), new Uint8Array([137, 80, 78, 71, 1, 2, 3]));
  assert.ok(again.index.folders.includes('Empty'));
  // What is deleted goes to .trash, as in a normal folder.
  assert.ok(backend.peek().some((e) => e.p === '.trash/Ideas.md'));
});

test('renaming folders and exporting work the same as on disk', async () => {
  const backend = memoryBackend();
  const v = await new LocalVault(await openKvDir(backend), { kind: 'memory' }).load();
  await v.createNote('Projects/House/Renovation', 'r');
  await v.renameFolder('Projects/House', 'Projects/Home');
  assert.equal(v.findByTitle('Renovation').path, 'Projects/Home/Renovation');
  assert.deepEqual((await v.exportAll()).map((f) => f.path), ['Projects/Home/Renovation.md']);
});
