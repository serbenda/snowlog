import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, applyTemplate, dailyPath, parseIsoDate, starterSpace, DAILY_TEMPLATE } from '../public/js/templates.js';
import { parseNote } from '../public/js/noteindex.js';
import { parseQuery, runQuery } from '../public/js/query.js';

const d = new Date(2026, 10, 12, 9, 5, 7); // jueves 12/11/2026 09:05:07

test('formatos de fecha en español y texto literal', () => {
  assert.equal(formatDate(d, 'YYYY-MM-DD'), '2026-11-12');
  assert.equal(formatDate(d, 'dddd, D [de] MMMM [de] YYYY'), 'jueves, 12 de noviembre de 2026');
  assert.equal(formatDate(d, 'ddd DD/MM/YY HH:mm:ss'), 'jue 12/11/26 09:05:07');
  assert.equal(formatDate(d, 'MMM'), 'nov');
});

test('variables de plantilla', () => {
  assert.equal(applyTemplate('# {{title}} · {{date}} · {{ date:D MMMM }} · {{time}} · {{time:HH}}', { title: 'Plan', date: d }),
    '# Plan · 2026-11-12 · 12 noviembre · 09:05 · 09');
  assert.equal(applyTemplate('{{otra}} {{TITLE}}', { title: 'x', date: d }), '{{otra}} x');
});

test('rutas de la nota diaria', () => {
  assert.equal(dailyPath('Diario', d), 'Diario/2026-11-12');
  assert.equal(dailyPath('', d), '2026-11-12');
  assert.equal(parseIsoDate('2026-02-03').getMonth(), 1);
  assert.equal(parseIsoDate('03/02/2026'), null);
});

test('la nota diaria generada no ensucia las consultas con tareas vacías', () => {
  const text = applyTemplate(DAILY_TEMPLATE, { title: '2026-11-12', date: d });
  assert.match(text, /^---\ndate: 2026-11-12\ntype: diario/);
  assert.match(text, /# jueves, 12 de noviembre de 2026/);
  const note = parseNote({ id: 'x', path: 'Diario/2026-11-12', text });
  assert.equal(note.tasks.length, 3);
  assert.ok(note.tasks.every((t) => t.empty));
  assert.equal(runQuery(parseQuery('TASK WHERE !completed'), [note]).count, 0);
});

test('espacio inicial con carpetas configurables', () => {
  const s = starterSpace({ home: 'Inicio', dailyFolder: 'Bitácora', templatesFolder: 'Sistema/Plantillas' });
  assert.deepEqual(s.folders, ['Proyectos', 'Archivo', 'Bitácora', 'Sistema/Plantillas']);
  assert.ok(s.notes.some((n) => n.path === 'Sistema/Plantillas/Nota diaria'));
  const home = s.notes[0].text;
  assert.match(home, /FROM "Bitácora"/);
  assert.match(home, /\[\[Sistema\/Plantillas\/Proyecto\|Proyecto\]\]/);
  for (const block of home.match(/```dataview\n([\s\S]*?)```/g)) {
    assert.doesNotThrow(() => parseQuery(block.replace(/```(dataview)?/g, '')), block);
  }
});
