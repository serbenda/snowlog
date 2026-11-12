import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNote, toggleTaskLine, linksTo, contentLines } from '../public/js/noteindex.js';
import { parseQuery, runQuery, renderResult, QueryError } from '../public/js/query.js';

const notes = [
  parseNote({ id: 'd1', path: 'Diario/2026-11-11', updated: '2026-11-11T20:00:00Z', text: '---\ntype: daily\ntags: [daily]\n---\n# Martes\n- [ ] #compromiso llamar al fontanero\n- [x] #compromiso pagar el seguro\n- [ ] #pendiente/casa medir la cocina\n```\n- [ ] dentro de código no cuenta #nope\n```\n> [!todo] Hoy\n> - [ ] tarea en callout' }),
  parseNote({ id: 'd2', path: 'Diario/2026-11-12', updated: '2026-11-12T09:00:00Z', text: '- [ ] #compromiso enviar fotos [[Reforma]]' }),
  parseNote({ id: 'p1', path: 'Proyectos/Casa/Reforma', updated: '2026-11-10T09:00:00Z', text: '---\ntype: project\nstatus: activo\narea: Casa\npriority: 2\n---\n# Reforma\nVer [[Inicio]] y [[Diario/2026-11-11|el martes]].' }),
  parseNote({ id: 'p2', path: 'Proyectos/Snowlog', updated: '2026-11-12T10:00:00Z', text: '---\ntype: project\nstatus: activo\narea: Personal\npriority: 1\ntags: [code]\n---\n' }),
  parseNote({ id: 'p3', path: 'Archivo/Viejo', text: '---\ntype: project\nstatus: cerrado\n---\n' }),
  parseNote({ id: 't1', path: 'Plantillas/Nota diaria', text: '- [ ] #compromiso ' }),
];
const run = (src, opts = {}) => runQuery(parseQuery(src), notes, { exclude: ['Plantillas'], now: '2026-11-12T12:00:00Z', ...opts });

test('índice: frontmatter, etiquetas, tareas fuera de código y enlaces', () => {
  const d1 = notes[0];
  assert.equal(d1.day, '2026-11-11');
  assert.deepEqual([...d1.tags].sort(), ['compromiso', 'daily', 'pendiente/casa']);
  assert.deepEqual(d1.tasks.map((t) => [t.line, t.completed, t.text]), [
    [5, false, '#compromiso llamar al fontanero'],
    [6, true, '#compromiso pagar el seguro'],
    [7, false, '#pendiente/casa medir la cocina'],
    [12, false, 'tarea en callout'],
  ]);
  assert.ok(linksTo(notes[2], notes[0]));
  assert.ok(linksTo(notes[1], notes[2]));
  assert.ok(!linksTo(notes[3], notes[2]));
  assert.equal(contentLines('```\nx\n```\ny').map((l) => l.value).join(), 'y');
  const code = parseNote({ id: 'c', path: 'C', text: 'Escribe `[[Otra]]` o `#tag` así' });
  assert.equal(code.links.size + code.tags.size, 0);
});

test('marcar y desmarcar una tarea por su línea, también en callouts', () => {
  const text = notes[0].text;
  const on = toggleTaskLine(text, 5);
  assert.match(on.split('\n')[5], /^- \[x\] #compromiso llamar/);
  assert.match(toggleTaskLine(on, 5).split('\n')[5], /^- \[ \] /);
  assert.equal(toggleTaskLine(text, 12, true).split('\n')[12], '> - [x] tarea en callout');
  assert.equal(toggleTaskLine(text, 4), null);
});

test('TASK como el panel de revisión: etiqueta, pendientes, agrupado por nota y sin plantillas', () => {
  const res = run('TASK\nWHERE contains(text, "#compromiso") AND !completed AND !contains(file.folder, "Plantillas")\nGROUP BY file.link');
  assert.equal(res.count, 2);
  assert.deepEqual(res.groups.map((g) => [g.note.name, g.tasks.map((t) => t.text)]), [
    ['2026-11-11', ['#compromiso llamar al fontanero']],
    ['2026-11-12', ['#compromiso enviar fotos [[Reforma]]']],
  ]);
  const html = renderResult(res);
  assert.match(html, /<input type="checkbox" class="task-checkbox" data-note="d1" data-line="5" aria-label="Marcar tarea">/);
  assert.match(html, /data-target="Diario\/2026-11-12">2026-11-12<\/a>/);
});

test('FROM por carpeta y por etiqueta (incluye subetiquetas)', () => {
  assert.equal(run('TASK FROM #pendiente WHERE !completed').count, 3); // FROM filtra notas, no tareas
  assert.equal(run('TASK WHERE contains(text, "#pendiente") AND !completed').count, 1);
  assert.deepEqual(run('LIST FROM "Proyectos"').notes.map((n) => n.name), ['Reforma', 'Snowlog']);
  assert.deepEqual(run('LIST FROM #code').notes.map((n) => n.name), ['Snowlog']);
  assert.deepEqual(run('LIST FROM !"Diario" AND !"Proyectos"').notes.map((n) => n.name), ['Viejo']);
});

test('TABLE de proyectos activos ordenados, con columnas y alias', () => {
  const res = run('TABLE status, area AS "Área", priority FROM "Proyectos" WHERE status = "activo" SORT priority ASC');
  assert.deepEqual(res.headers, ['status', 'Área', 'priority']);
  assert.deepEqual(res.rows.map((r) => [r.note.name, ...r.values]), [['Snowlog', 'activo', 'Personal', '1'], ['Reforma', 'activo', 'Casa', '2']]);
  assert.match(renderResult(res), /<th>Nota<\/th><th>status<\/th><th>Área<\/th>/);
});

test('fechas, LIMIT, SORT DESC y OR', () => {
  assert.deepEqual(run('LIST FROM "Diario" SORT file.name DESC LIMIT 1').notes.map((n) => n.name), ['2026-11-12']);
  assert.deepEqual(run('LIST WHERE file.day = date(today)').notes.map((n) => n.name), ['2026-11-12']);
  assert.deepEqual(run('LIST WHERE file.day < date(today)').notes.map((n) => n.name), ['2026-11-11']);
  assert.equal(run('LIST WHERE type = "daily" OR area = "Casa"').count, 2);
  assert.equal(run('LIST WHERE (type = "project") AND NOT (status = "activo")').count, 1);
});

test('errores claros y HTML seguro', () => {
  assert.throws(() => parseQuery('SELECT * FROM notas'), QueryError);
  assert.throws(() => parseQuery('TASK WHERE contains(text'), QueryError);
  assert.throws(() => run('LIST WHERE nada(1)'), /Función desconocida/);
  const evil = [parseNote({ id: 'x', path: 'A/<img src=x onerror=alert(1)>', text: '- [ ] <script>alert(1)</script>' })];
  const html = renderResult(runQuery(parseQuery('TASK'), evil)) + renderResult(runQuery(parseQuery('LIST'), evil));
  assert.ok(!html.includes('<script') && !html.includes('<img'));
});
