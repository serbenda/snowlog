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

test('adjuntos en local: ficheros normales, a la papelera al borrar y dentro del .zip', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  assert.deepEqual(v.files().map((f) => f.path), ['Proyectos/Casa/plano.png']);
  const pdf = new TextEncoder().encode('%PDF-1.4 hola');
  const { id, path } = await v.addFile('Proyectos/Casa', 'plano.png', new Uint8Array([1]));
  assert.equal(path, 'Proyectos/Casa/plano 1.png');
  const doc = await v.addFile('Adjuntos', 'factura.pdf', pdf);
  assert.ok(root.list().includes('Adjuntos/factura.pdf'));
  assert.deepEqual(await v.readFile(doc.id), pdf);
  await v.deleteFile(id);
  assert.ok(root.list().includes('.trash/Proyectos/Casa/plano 1.png'));
  await v.renameFolder('Adjuntos', 'Docs');
  assert.equal(v.findFile('factura.pdf').path, 'Docs/factura.pdf');
  const all = await v.exportAll();
  assert.ok(all.some((f) => f.path === 'Docs/factura.pdf' && f.data));
  await v.deleteFolder('Docs');
  assert.equal(v.findFile('factura.pdf'), null);
});

test('si el fichero cambió fuera (carpeta sincronizada), se guarda una copia', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  const id = v.findByTitle('Inicio').id;
  await v.read(id);
  root.put('Inicio.md', 'cambiado en el otro ordenador');
  const res = await v.saveNote(id, 'cambiado aquí');
  assert.ok(res.conflict);
  assert.equal(root.text('Inicio.md'), 'cambiado aquí');
  assert.equal(root.text(`${res.conflict.path}.md`), 'cambiado en el otro ordenador');
  assert.deepEqual(await v.saveNote(id, 'sin conflicto'), {});
});

test('historial en local: copias cada 10 minutos, las 50 últimas, y siguen a la nota al renombrar', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  let t = Date.UTC(2026, 10, 13, 9, 0);
  v.now = () => t;
  const id = v.findByTitle('Inicio').id;
  await v.read(id);
  await v.saveNote(id, 'v2'); // guarda copia de la versión anterior
  t += 60 * 1000;
  await v.saveNote(id, 'v3'); // menos de 10 minutos: sin copia nueva
  t += 11 * 60 * 1000;
  await v.saveNote(id, 'v4');
  const versions = await v.history(id);
  assert.deepEqual(await Promise.all(versions.map((x) => v.readVersion(id, x.ref))), ['v4', 'v3', '# Inicio\n[[Reforma]]']);
  assert.equal(v.notes().length, 3, 'el historial no aparece como notas');
  await v.renameNote(id, 'Portada');
  assert.equal((await v.history(id)).length, 3);
  await assert.rejects(v.readVersion(id, '../../Inicio.md'), /missing/);
  for (let i = 0; i < 55; i++) { t += 11 * 60 * 1000; await v.saveNote(id, `x${i}`); }
  assert.equal((await v.history(id)).length, 51);
  const again = await new LocalVault(root).load();
  assert.equal(again.notes().length, 3);
});

test('ajustes en local: un JSON en .snowlog que viaja con la carpeta', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  assert.deepEqual(v.getSettings(), {});
  await v.saveSettings({ dailyFolder: 'Bitácora' });
  assert.match(root.text('.snowlog/ajustes.json'), /Bitácora/);
  const again = await new LocalVault(root).load();
  assert.deepEqual(again.getSettings(), { dailyFolder: 'Bitácora' });
  assert.ok(!again.index.folders.includes('.snowlog'));
});

test('detecta lo que cambia en la carpeta desde fuera, sin perder los ids', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  const inicio = v.findByTitle('Inicio').id;
  const reforma = v.findByTitle('Reforma').id;
  await v.read(inicio);
  const mine = await v.createNote('Mía', 'escrita aquí');
  await v.saveNote(reforma, 'guardada aquí');
  assert.deepEqual(await v.rescan(), { added: [], removed: [], changed: [] }, 'lo que escribimos nosotros no cuenta');
  await new Promise((r) => setTimeout(r, 5));
  root.put('Inicio.md', 'cambiado con otro editor');
  root.children.get('Inicio.md').mtime = Date.now();
  root.put('Nueva de fuera.md', 'hola');
  await root.removeEntry('Mía.md');
  const res = await v.rescan();
  assert.deepEqual(res.changed, [inicio]);
  assert.deepEqual(res.removed, [mine]);
  assert.equal(res.added.length, 1);
  assert.equal(v.index.notes[res.added[0]].path, 'Nueva de fuera');
  assert.equal(await v.read(inicio), 'cambiado con otro editor');
  assert.equal(v.findByTitle('Reforma').id, reforma, 'los ids se conservan');
});

test('cambios de fuera en otras líneas se juntan con los de aquí', async () => {
  const root = sampleFolder();
  root.put('Lista.md', 'uno\ndos\ntres');
  const v = await new LocalVault(root).load();
  const id = v.findByTitle('Lista').id;
  await v.read(id);
  root.put('Lista.md', 'uno\ndos\ntres\ncuatro (de OneDrive)');
  root.children.get('Lista.md').mtime = Date.now() + 5;
  await v.rescan(); // la ve cambiada mientras aquí se sigue escribiendo
  const res = await v.saveNote(id, 'UNO\ndos\ntres');
  assert.equal(res.conflict, undefined);
  assert.equal(res.merged, 'UNO\ndos\ntres\ncuatro (de OneDrive)');
  assert.equal(root.text('Lista.md'), 'UNO\ndos\ntres\ncuatro (de OneDrive)');
});

test('dibujos en local: se reescriben y lo cambiado fuera se guarda como copia', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  const enc = (s) => new TextEncoder().encode(s);
  const { id } = await v.addFile('Dibujos', 'esquema.sketch', enc('uno'));
  await v.saveFile(id, enc('dos'));
  assert.equal(root.text('Dibujos/esquema.sketch'), 'dos');
  root.put('Dibujos/esquema.sketch', 'cambiado fuera');
  const res = await v.saveFile(id, enc('tres'));
  assert.ok(res.conflict);
  assert.equal(root.text('Dibujos/esquema.sketch'), 'tres');
  assert.equal(root.text(res.conflict.path), 'cambiado fuera');
});

test('dibujos en local: lo cambiado fuera en otros elementos se junta', async () => {
  const { mergeScenes, parseScene, serializeScene, emptyScene } = await import('../public/js/sketch-escena.js');
  const enc = (scene) => new TextEncoder().encode(serializeScene(scene));
  const dec = (b) => parseScene(new TextDecoder().decode(b));
  const merge = (b, m, t) => {
    const r = mergeScenes(dec(b), dec(m), dec(t));
    return { bytes: enc(r.scene), conflict: r.conflict };
  };
  const box = (id, x) => ({ id, type: 'rectangle', x, y: 0, w: 10, h: 10, seed: 1 });
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  const base = { ...emptyScene(), elements: [box('a', 0)] };
  const { id } = await v.addFile('Dibujos', 'esquema.sketch', enc(base));
  root.put('Dibujos/esquema.sketch', serializeScene({ ...base, elements: [box('a', 0), box('fuera', 50)] }));
  const res = await v.saveFile(id, enc({ ...base, elements: [box('a', 9)] }), { merge });
  assert.equal(res.conflict, undefined);
  assert.deepEqual(dec(new TextEncoder().encode(root.text('Dibujos/esquema.sketch'))).elements.map((e) => [e.id, e.x]), [['a', 9], ['fuera', 50]]);
  // Si no se puede juntar (no es un dibujo), copia como antes.
  root.put('Dibujos/esquema.sketch', 'esto no es json');
  const res2 = await v.saveFile(id, enc(base), { merge });
  assert.ok(res2.conflict);
});
