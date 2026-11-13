import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemDir } from './memfs.mjs';
import { LocalVault } from '../public/js/localvault.js';
import { makeZip, crc32 } from '../public/js/zip.js';

function sampleFolder() {
  const root = new MemDir('MisNotas');
  root.put('Inicio.md', '# Inicio\n[[Reforma]]');
  root.put('Proyectos/Casa/Reforma.md', '---\nstatus: activo\n---\n# Reforma');
  root.put('Proyectos/Casa/plano.png', new Uint8Array([137, 80, 78, 71]));
  root.put('Diario/2026-11-12.md', '- [ ] #compromiso algo');
  root.put('.obsidian/app.json', '{}');
  root.put('.trash/viejo.md', 'borrado');
  root.put('Notas sueltas.txt', 'no es una nota');
  return root;
}

test('carga solo notas .md y carpetas visibles, como una bóveda de Obsidian', async () => {
  const v = await new LocalVault(sampleFolder()).load();
  assert.equal(v.label, 'MisNotas');
  assert.deepEqual(v.notes().map((n) => n.path).sort(), ['Diario/2026-11-12', 'Inicio', 'Proyectos/Casa/Reforma']);
  assert.deepEqual(v.index.folders.sort(), ['Diario', 'Proyectos', 'Proyectos/Casa']);
  assert.equal(await v.read(v.findByTitle('reforma').id), '---\nstatus: activo\n---\n# Reforma');
});

test('crear, guardar y renombrar escriben ficheros .md normales', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  const id = await v.createNote('Ideas/Viaje', 'hola');
  assert.equal(root.text('Ideas/Viaje.md'), 'hola');
  await v.saveNote(id, 'hola de nuevo');
  assert.equal(root.text('Ideas/Viaje.md'), 'hola de nuevo');
  await v.renameNote(id, 'Ideas/Viaje a Japón');
  assert.ok(root.list().includes('Ideas/Viaje a Japón.md'));
  assert.ok(!root.list().includes('Ideas/Viaje.md'));
  await assert.rejects(v.createNote('Inicio'), /exists/);
  await assert.rejects(v.createNote('a:b'), /bad_chars/);
});

test('borrar mueve a la papelera .trash, sin perder nada', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  await v.deleteNote(v.findByTitle('Inicio').id);
  assert.ok(!root.list().includes('Inicio.md'));
  assert.equal(root.text('.trash/Inicio.md'), '# Inicio\n[[Reforma]]');
  await v.deleteFolder('Proyectos');
  assert.ok(root.list().includes('.trash/Proyectos/Casa/plano.png'));
  assert.ok(root.list().includes('.trash/Proyectos/Casa/Reforma.md'));
  assert.ok(!root.list().some((p) => p.startsWith('Proyectos')));
  assert.equal(v.notes().length, 1);
});

test('renombrar una carpeta mueve también los adjuntos', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  await v.renameFolder('Proyectos/Casa', 'Proyectos/Hogar');
  assert.ok(root.list().includes('Proyectos/Hogar/plano.png'));
  assert.ok(root.list().includes('Proyectos/Hogar/Reforma.md'));
  assert.ok(!root.list().includes('Proyectos/Casa/'));
  assert.equal(v.findByTitle('Reforma').path, 'Proyectos/Hogar/Reforma');
  await assert.rejects(v.renameFolder('Proyectos', 'Diario'), /exists/);
});

test('importar y exportar', async () => {
  const root = new MemDir('vacía');
  const v = await new LocalVault(root).load();
  const res = await v.importNotes([{ path: 'A/uno', text: '1' }, { path: 'A/uno', text: '2' }], { folders: ['Archivo'] });
  assert.deepEqual(res.map((r) => r.path), ['A/uno', 'A/uno (importada)']);
  assert.ok(root.list().includes('Archivo/'));
  assert.deepEqual((await v.exportAll()).map((f) => f.path).sort(), ['A/uno (importada).md', 'A/uno.md']);
});

test('el .zip exportado se abre con herramientas estándar', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const zip = makeZip([{ path: 'Diario/2026-11-13.md', text: '# Viernes ñ' }, { path: 'Inicio.md', text: 'hola' }]);
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  const file = join(dir, 'notas.zip');
  writeFileSync(file, zip);
  const out = execFileSync('python3', ['-I', '-c',
    'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print("|".join(n+"="+z.read(n).decode() for n in z.namelist()))', file]).toString().trim();
  assert.equal(out, 'Diario/2026-11-13.md=# Viernes ñ|Inicio.md=hola');
});

test('saveMany en local escribe cada fichero', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  const id = v.findByTitle('Inicio').id;
  await v.saveMany([{ id, text: 'nuevo' }]);
  assert.equal(root.text('Inicio.md'), 'nuevo');
});
