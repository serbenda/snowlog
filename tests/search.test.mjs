import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNote } from '../public/js/noteindex.js';
import { fold, parseSearch, searchNotes, tagCounts } from '../public/js/search.js';

const notes = [
  { id: 'a', path: 'Proyectos/Web de recetas', text: '# Web de recetas\nPasar 20 recetas a la web #proyecto/web\n- [ ] Revisar diseño con Blanca', updated: '2026-11-10' },
  { id: 'b', path: 'Diario/2026-11-13', text: 'Reunión sobre el DISEÑO de la portada.\n#reunion', updated: '2026-11-13' },
  { id: 'c', path: 'Recetas', text: 'Lista de recetas de la abuela #cocina', updated: '2026-11-01' },
].map(parseNote);

test('plegar quita acentos y mayúsculas sin cambiar la longitud', () => {
  for (const s of ['Diseño Ácido ÑANDÚ', 'emoji 👍 y çà', 'İstanbul ß']) assert.equal(fold(s).length, s.length);
  assert.equal(fold('Diseño ÁCIDO'), 'diseno acido');
});

test('analiza términos, frases, exclusiones, etiquetas y rutas', () => {
  assert.deepEqual(parseSearch('diseño "la portada" -blanca tag:#Reunion path:Diario'), {
    terms: ['diseno', 'la portada'], not: ['blanca'], tags: [{ neg: false, tag: 'reunion' }], paths: [{ neg: false, path: 'diario' }],
  });
});

test('busca sin acentos ni mayúsculas y da el contexto', () => {
  const r = searchNotes(notes, 'diseno');
  assert.deepEqual(r.map((x) => x.note.id).sort(), ['a', 'b']);
  const one = searchNotes(notes, 'diseno', { limit: 1 });
  assert.equal(one.length, 1);
  assert.equal(one.total, 2);
  const b = r.find((x) => x.note.id === 'b');
  const m = b.matches[0];
  assert.equal(m.line, 0);
  assert.equal(m.text.slice(m.marks[0][0], m.marks[0][1]), 'DISEÑO');
  assert.equal(notes[1].text.slice(m.offset, m.offset + m.length), 'DISEÑO');
});

test('todas las palabras, frases y exclusiones', () => {
  assert.deepEqual(searchNotes(notes, 'recetas web').map((x) => x.note.id), ['a']);
  assert.deepEqual(searchNotes(notes, '"de la abuela"').map((x) => x.note.id), ['c']);
  assert.deepEqual(searchNotes(notes, 'recetas -abuela').map((x) => x.note.id), ['a']);
  assert.equal(searchNotes(notes, '   ').length, 0);
});

test('el nombre pesa más que el texto', () => {
  assert.equal(searchNotes(notes, 'recetas')[0].note.id, 'c');
});

test('filtrar por etiqueta (con hijas) y por ruta', () => {
  assert.deepEqual(searchNotes(notes, 'tag:#proyecto').map((x) => x.note.id), ['a']);
  assert.deepEqual(searchNotes(notes, 'tag:reunion').map((x) => x.note.id), ['b']);
  assert.deepEqual(searchNotes(notes, 'path:diario').map((x) => x.note.id), ['b']);
  assert.deepEqual(searchNotes(notes, 'recetas -path:proyectos').map((x) => x.note.id), ['c']);
});

test('recuento de etiquetas', () => {
  const extra = parseNote({ id: 'd', path: 'X', text: '#cocina' });
  assert.deepEqual(tagCounts([...notes, extra])[0], { tag: 'cocina', count: 2 });
});

test('1.000 notas en menos de 300 ms', () => {
  const words = 'proyecto reunión tarea diseño web receta cliente equipo revisar código prueba entrega'.split(' ');
  const many = Array.from({ length: 1000 }, (_, i) => parseNote({
    id: String(i),
    path: `Carpeta ${i % 20}/Nota ${i}`,
    text: Array.from({ length: 40 }, (_, j) => `- ${words[(i + j) % words.length]} línea ${j} con texto de relleno para que pese #t${j % 7}`).join('\n'),
  }));
  searchNotes(many, 'calentar'); // primera vez: pliega el texto de todas
  const t0 = performance.now();
  const r = searchNotes(many, 'diseño entrega');
  const ms = performance.now() - t0;
  assert.ok(r.length > 0);
  assert.ok(ms < 300, `${ms.toFixed(0)} ms`);
  const t1 = performance.now();
  searchNotes(many.map((n) => ({ ...n })), 'cliente');
  assert.ok(performance.now() - t1 < 300, 'también la primera búsqueda');
});
