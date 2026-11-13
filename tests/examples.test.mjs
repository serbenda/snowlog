import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exampleSpace } from '../public/js/examples.js';
import { parseNote } from '../public/js/noteindex.js';
import { parseQuery, runQuery } from '../public/js/query.js';
import { normalizePath } from '../public/js/vault.js';

const now = new Date(2026, 10, 12, 10, 0);
const space = exampleSpace({ dailyFolder: 'Diario', now });
const notes = space.notes.map((n, i) => parseNote({ id: `e${i}`, path: n.path, text: n.text, updated: `2026-11-1${i % 3}T10:00:00Z` }));
const byName = (name) => notes.find((n) => n.name === name);
const queriesOf = (text) => [...text.matchAll(/```dataview\n([\s\S]*?)```/g)].map((m) => m[1]);
const run = (src) => runQuery(parseQuery(src), notes, { exclude: ['Plantillas'], now: now.toISOString() });

test('rutas válidas, sin repetir y con fechas relativas al día de carga', () => {
  const paths = space.notes.map((n) => n.path);
  assert.equal(new Set(paths.map((p) => p.toLowerCase())).size, paths.length);
  for (const p of paths) {
    assert.equal(normalizePath(p), p);
    assert.ok(!/[\\:*?"<>|#^[\]]/.test(p), p);
  }
  assert.ok(paths.includes('Diario/2026-11-10') && paths.includes('Diario/2026-11-11') && paths.includes('Diario/2026-11-12'));
  assert.ok(space.folders.includes('Proyectos/Ejemplo - Web de recetas/Historias'));
});

test('las consultas del ejemplo funcionan y muestran lo esperado', () => {
  for (const n of space.notes) for (const q of queriesOf(n.text)) assert.doesNotThrow(() => parseQuery(q), `${n.path}: ${q}`);
  const project = space.notes.find((n) => n.path.endsWith('/Web de recetas'));
  const [table, tasks] = queriesOf(project.text);
  const t = run(table);
  assert.deepEqual(t.rows.map((r) => [r.note.name.slice(0, 5), ...r.values]), [
    ['HU-01', 'hecha', '1', '3'], ['HU-02', 'en curso', '2', '5'], ['HU-03', 'pendiente', '3', '8'], ['HU-04', 'idea', '4', '5'],
  ]);
  assert.ok(run(tasks).count >= 8);
  const board = space.notes.find((n) => n.path.endsWith('/Tablero'));
  assert.deepEqual(run(queriesOf(board.text)[0]).notes.map((n) => n.name), ['HU-02 Guardar recetas favoritas']);
});

test('los compromisos y pendientes aparecen en el panel como en Inicio', () => {
  const open = run('TASK WHERE contains(text, "#compromiso") AND !completed GROUP BY file.link');
  assert.deepEqual(open.groups.map((g) => g.note.name).sort(), ['2026-11-11', '2026-11-12', 'Reunión 2026-11-10 Planificación del sprint 1']);
  assert.equal(run('TASK WHERE contains(text, "#pendiente") AND !completed').count, 3);
  assert.equal(run('TASK FROM "Diario" WHERE file.day = date(today) AND !completed AND !contains(text, "#compromiso") AND !contains(text, "#pendiente")').count, 2);
});

test('todo está enlazado: la historia en curso tiene enlaces entrantes', () => {
  const hu2 = byName('HU-02 Guardar recetas favoritas');
  const from = notes.filter((n) => n !== hu2 && (n.links.has(hu2.name.toLowerCase()))).map((n) => n.name).sort();
  assert.deepEqual(from, ['2026-11-11', '2026-11-12', 'Reunión 2026-11-10 Planificación del sprint 1']);
});
