import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNote, toggleTaskLine, linksTo, contentLines } from '../public/js/noteindex.js';
import { parseQuery, runQuery, renderResult, QueryError } from '../public/js/query.js';

const notes = [
  parseNote({ id: 'd1', path: 'Daily/2026-11-11', updated: '2026-11-11T20:00:00Z', text: '---\ntype: daily\ntags: [daily]\n---\n# Tuesday\n- [ ] #commitment call the plumber\n- [x] #commitment pay the insurance\n- [ ] #to-discuss/home measure the kitchen\n```\n- [ ] inside code does not count #nope\n```\n> [!todo] Today\n> - [ ] task in a callout' }),
  parseNote({ id: 'd2', path: 'Daily/2026-11-12', updated: '2026-11-12T09:00:00Z', text: '- [ ] #commitment send photos [[Renovation]]' }),
  parseNote({ id: 'p1', path: 'Projects/House/Renovation', updated: '2026-11-10T09:00:00Z', text: '---\ntype: project\nstatus: active\narea: House\npriority: 2\n---\n# Renovation\nSee [[Home]] and [[Daily/2026-11-11|Tuesday]].' }),
  parseNote({ id: 'p2', path: 'Projects/Snowlog', updated: '2026-11-12T10:00:00Z', text: '---\ntype: project\nstatus: active\narea: Personal\npriority: 1\ntags: [code]\n---\n' }),
  parseNote({ id: 'p3', path: 'Archive/Old', text: '---\ntype: project\nstatus: closed\n---\n' }),
  parseNote({ id: 't1', path: 'Templates/Daily note', text: '- [ ] #commitment ' }),
];
const run = (src, opts = {}) => runQuery(parseQuery(src), notes, { exclude: ['Templates'], now: '2026-11-12T12:00:00Z', ...opts });

test('index: frontmatter, tags, tasks outside code, and links', () => {
  const d1 = notes[0];
  assert.equal(d1.day, '2026-11-11');
  assert.deepEqual([...d1.tags].sort(), ['commitment', 'daily', 'to-discuss/home']);
  assert.deepEqual(d1.tasks.map((t) => [t.line, t.completed, t.text]), [
    [5, false, '#commitment call the plumber'],
    [6, true, '#commitment pay the insurance'],
    [7, false, '#to-discuss/home measure the kitchen'],
    [12, false, 'task in a callout'],
  ]);
  assert.ok(linksTo(notes[2], notes[0]));
  assert.ok(linksTo(notes[1], notes[2]));
  assert.ok(!linksTo(notes[3], notes[2]));
  assert.equal(contentLines('```\nx\n```\ny').map((l) => l.value).join(), 'y');
  const code = parseNote({ id: 'c', path: 'C', text: 'Write `[[Other]]` or `#tag` like this' });
  assert.equal(code.links.size + code.tags.size, 0);
});

test('tick and untick a task by its line, in callouts too', () => {
  const text = notes[0].text;
  const on = toggleTaskLine(text, 5);
  assert.match(on.split('\n')[5], /^- \[x\] #commitment call/);
  assert.match(toggleTaskLine(on, 5).split('\n')[5], /^- \[ \] /);
  assert.equal(toggleTaskLine(text, 12, true).split('\n')[12], '> - [x] task in a callout');
  assert.equal(toggleTaskLine(text, 4), null);
});

test('TASK like the review dashboard: tag, open items, grouped by note and without templates', () => {
  const res = run('TASK\nWHERE contains(text, "#commitment") AND !completed AND !contains(file.folder, "Templates")\nGROUP BY file.link');
  assert.equal(res.count, 2);
  assert.deepEqual(res.groups.map((g) => [g.note.name, g.tasks.map((t) => t.text)]), [
    ['2026-11-11', ['#commitment call the plumber']],
    ['2026-11-12', ['#commitment send photos [[Renovation]]']],
  ]);
  const html = renderResult(res);
  assert.match(html, /<input type="checkbox" class="task-checkbox" data-note="d1" data-line="5" aria-label="Toggle task">/);
  assert.match(html, /data-target="Daily\/2026-11-12">2026-11-12<\/a>/);
});

test('FROM by folder and by tag (includes subtags)', () => {
  assert.equal(run('TASK FROM #to-discuss WHERE !completed').count, 3); // FROM filters notes, not tasks
  assert.equal(run('TASK WHERE contains(text, "#to-discuss") AND !completed').count, 1);
  assert.deepEqual(run('LIST FROM "Projects"').notes.map((n) => n.name), ['Renovation', 'Snowlog']);
  assert.deepEqual(run('LIST FROM #code').notes.map((n) => n.name), ['Snowlog']);
  assert.deepEqual(run('LIST FROM !"Daily" AND !"Projects"').notes.map((n) => n.name), ['Old']);
});

test('TABLE of active projects, sorted, with columns and aliases', () => {
  const res = run('TABLE status, area AS "Área", priority FROM "Projects" WHERE status = "active" SORT priority ASC');
  assert.deepEqual(res.headers, ['status', 'Área', 'priority']);
  assert.deepEqual(res.rows.map((r) => [r.note.name, ...r.values]), [['Snowlog', 'active', 'Personal', '1'], ['Renovation', 'active', 'House', '2']]);
  assert.match(renderResult(res), /<th>Note<\/th><th>status<\/th><th>Área<\/th>/);
});

test('dates, LIMIT, SORT DESC and OR', () => {
  assert.deepEqual(run('LIST FROM "Daily" SORT file.name DESC LIMIT 1').notes.map((n) => n.name), ['2026-11-12']);
  assert.deepEqual(run('LIST WHERE file.day = date(today)').notes.map((n) => n.name), ['2026-11-12']);
  assert.deepEqual(run('LIST WHERE file.day < date(today)').notes.map((n) => n.name), ['2026-11-11']);
  assert.equal(run('LIST WHERE type = "daily" OR area = "House"').count, 2);
  assert.equal(run('LIST WHERE (type = "project") AND NOT (status = "active")').count, 1);
  // The Spanish names of today, tomorrow and yesterday still work in existing queries.
  assert.deepEqual(run('LIST WHERE file.day = date(hoy)').notes.map((n) => n.name), ['2026-11-12']);
  assert.deepEqual(run('LIST WHERE file.day = date(ayer)').notes.map((n) => n.name), ['2026-11-11']);
});

test('clear errors and safe HTML', () => {
  assert.throws(() => parseQuery('SELECT * FROM notes'), QueryError);
  assert.throws(() => parseQuery('TASK WHERE contains(text'), QueryError);
  assert.throws(() => run('LIST WHERE nothing(1)'), /Unknown function/);
  const evil = [parseNote({ id: 'x', path: 'A/<img src=x onerror=alert(1)>', text: '- [ ] <script>alert(1)</script>' })];
  const html = renderResult(runQuery(parseQuery('TASK'), evil)) + renderResult(runQuery(parseQuery('LIST'), evil));
  assert.ok(!html.includes('<script') && !html.includes('<img'));
});
