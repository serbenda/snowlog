import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planImport, formatBytes, MAX_NOTE_BYTES } from '../public/js/import.js';

const f = (rel, size = 10) => ({ webkitRelativePath: rel, name: rel.split('/').pop(), size });

test('quita la carpeta raíz elegida y se queda solo con las notas Markdown', () => {
  const { root, notes, skipped } = planImport([
    f('MiBoveda/Inicio.md'),
    f('MiBoveda/Proyectos/Casa/Reforma.MD'),
    f('MiBoveda/.obsidian/app.json'),
    f('MiBoveda/.obsidian/plugins/dataview/main.js'),
    f('MiBoveda/.trash/viejo.md'),
    f('MiBoveda/.git/HEAD'),
    f('MiBoveda/assets/foto.png'),
    f('MiBoveda/Dibujo.excalidraw'),
    f('MiBoveda/.DS_Store'),
    f('MiBoveda/Enorme.md', MAX_NOTE_BYTES + 1),
  ]);
  assert.equal(root, 'MiBoveda');
  assert.deepEqual(notes.map((n) => n.path), ['Inicio', 'Proyectos/Casa/Reforma']);
  assert.deepEqual(skipped, { config: 5, other: 2, tooBig: 1 });
});

test('limpia caracteres que Snowlog no admite en los nombres', () => {
  const { notes } = planImport([f('V/Reunión: equipo #1 [borrador].md'), f('V/a|b/c?.md')]);
  assert.deepEqual(notes.map((n) => n.path), ['a-b/c-', 'Reunión- equipo -1 -borrador-']);
});

test('sin carpeta común no quita nada', () => {
  const { root, notes } = planImport([{ name: 'suelta.md', size: 3 }, f('A/b.md')]);
  assert.equal(root, '');
  assert.deepEqual(notes.map((n) => n.path), ['A/b', 'suelta']);
});

test('tamaños legibles', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(3 * 1024 * 1024), '3.0 MB');
});
