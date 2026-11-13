import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openKvDir, memoryBackend } from '../public/js/kvdir.js';
import { LocalVault } from '../public/js/localvault.js';

test('Firefox y Safari: las notas se guardan dentro del navegador y siguen ahí al volver', async () => {
  const backend = memoryBackend();
  const root = await openKvDir(backend);
  const v = await new LocalVault(root, { kind: 'memory', label: 'este navegador' }).load();
  const a = await v.createNote('Diario/2026-11-13', '# Viernes ñ');
  await v.createNote('Ideas', 'idea');
  await v.saveNote(a, '# Viernes ñ\nmás');
  await v.addFile('Adjuntos', 'foto.png', new Uint8Array([137, 80, 78, 71, 1, 2, 3]));
  await v.createFolder('Vacía');
  await v.deleteNote(v.findByTitle('Ideas').id);
  await root.flush();

  const again = await new LocalVault(await openKvDir(backend), { kind: 'memory' }).load();
  assert.deepEqual(again.notes().map((n) => n.path), ['Diario/2026-11-13']);
  assert.equal(await again.read(again.findByTitle('2026-11-13').id), '# Viernes ñ\nmás');
  assert.deepEqual(await again.readFile(again.findFile('foto.png').id), new Uint8Array([137, 80, 78, 71, 1, 2, 3]));
  assert.ok(again.index.folders.includes('Vacía'));
  // Lo borrado va a .trash, como en una carpeta normal.
  assert.ok(backend.peek().some((e) => e.p === '.trash/Ideas.md'));
});

test('renombrar carpetas y exportar funcionan igual que en disco', async () => {
  const backend = memoryBackend();
  const v = await new LocalVault(await openKvDir(backend), { kind: 'memory' }).load();
  await v.createNote('Proyectos/Casa/Reforma', 'r');
  await v.renameFolder('Proyectos/Casa', 'Proyectos/Hogar');
  assert.equal(v.findByTitle('Reforma').path, 'Proyectos/Hogar/Reforma');
  assert.deepEqual((await v.exportAll()).map((f) => f.path), ['Proyectos/Hogar/Reforma.md']);
});
