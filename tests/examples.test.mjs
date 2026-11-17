import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exampleSpace } from '../public/js/examples.js';
import { parseNote } from '../public/js/noteindex.js';
import { parseQuery, runQuery } from '../public/js/query.js';
import { normalizePath } from '../public/js/vault.js';

const now = new Date(2026, 10, 12, 10, 0);
const space = exampleSpace({ dailyFolder: 'Daily', now });
const notes = space.notes.map((n, i) => parseNote({ id: `e${i}`, path: n.path, text: n.text, updated: `2026-11-1${i % 3}T10:00:00Z` }));
const byName = (name) => notes.find((n) => n.name === name);
const queriesOf = (text) => [...text.matchAll(/```dataview\n([\s\S]*?)```/g)].map((m) => m[1]);
const run = (src) => runQuery(parseQuery(src), notes, { exclude: ['Templates'], now: now.toISOString() });

test('valid, unique paths with dates relative to the load day', () => {
  const paths = space.notes.map((n) => n.path);
  assert.equal(new Set(paths.map((p) => p.toLowerCase())).size, paths.length);
  for (const p of paths) {
    assert.equal(normalizePath(p), p);
    assert.ok(!/[\\:*?"<>|#^[\]]/.test(p), p);
  }
  assert.ok(paths.includes('Daily/2026-11-10') && paths.includes('Daily/2026-11-11') && paths.includes('Daily/2026-11-12'));
  assert.ok(space.folders.includes('Projects/Example - Recipe website/Stories'));
});

test('the example queries work and show what is expected', () => {
  for (const n of space.notes) for (const q of queriesOf(n.text)) assert.doesNotThrow(() => parseQuery(q), `${n.path}: ${q}`);
  const project = space.notes.find((n) => n.path.endsWith('/Recipe website'));
  const [table, tasks] = queriesOf(project.text);
  const t = run(table);
  assert.deepEqual(t.rows.map((r) => [r.note.name.slice(0, 5), ...r.values]), [
    ['US-01', 'done', '1', '3'], ['US-02', 'in progress', '2', '5'], ['US-03', 'to do', '3', '8'], ['US-04', 'idea', '4', '5'],
  ]);
  assert.ok(run(tasks).count >= 8);
  const board = space.notes.find((n) => n.path.endsWith('/Board'));
  assert.deepEqual(run(queriesOf(board.text)[0]).notes.map((n) => n.name), ['US-02 Save favorite recipes']);
});

test('commitments and items to discuss show up as on the Home dashboard', () => {
  const open = run('TASK WHERE contains(text, "#commitment") AND !completed GROUP BY file.link');
  assert.deepEqual(open.groups.map((g) => g.note.name).sort(), ['2026-11-11', '2026-11-12', 'Meeting 2026-11-10 Sprint 1 planning']);
  assert.equal(run('TASK WHERE contains(text, "#to-discuss") AND !completed').count, 3);
  assert.equal(run('TASK FROM "Daily" WHERE file.day = date(today) AND !completed AND !contains(text, "#commitment") AND !contains(text, "#to-discuss")').count, 2);
});

test('everything is linked: the story in progress has backlinks', () => {
  const hu2 = byName('US-02 Save favorite recipes');
  const from = notes.filter((n) => n !== hu2 && (n.links.has(hu2.name.toLowerCase()))).map((n) => n.name).sort();
  assert.deepEqual(from, ['2026-11-11', '2026-11-12', 'Meeting 2026-11-10 Sprint 1 planning']);
});
