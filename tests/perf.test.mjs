// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// A big vault stays usable: 5,000 notes (with links, tags and tasks), a long note, a long merge, a big backup. The
// budgets are generous (CI machines are slow); the times are printed so a change can be compared.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../public/js/markdown.js';
import { parseNote } from '../public/js/noteindex.js';
import { searchNotes } from '../public/js/search.js';
import { parseQuery, runQuery } from '../public/js/query.js';
import { buildGraph } from '../public/js/graph.js';
import { merge3 } from '../public/js/merge.js';
import { makeZip, readZip } from '../public/js/zip.js';

const N = 5000;
const times = {};
const timed = (name, fn) => {
  const t0 = performance.now();
  const out = fn();
  times[name] = Math.round(performance.now() - t0);
  return out;
};

test('5,000 notes: indexing, search, a query, the graph, a long note, a merge and a backup', () => {
  const texts = Array.from({ length: N }, (_, i) => `# Note ${i}\n\nSee [[Note ${(i * 7) % N}]] and [[Folder ${i % 50}/Note ${(i + 1) % N}]] #tag${i % 40} #project/a${i % 9}\n\n- [ ] task ${i} due:: 2026-12-${String(1 + (i % 28)).padStart(2, '0')}\n- [x] done ${i}\n\n${'Some words of text, with café and ñandú. '.repeat(20)}`);
  const notes = timed('index', () => texts.map((text, i) => parseNote({ id: `n${i}`, path: `Folder ${i % 50}/Note ${i}`, text, created: '2026-01-01T00:00:00Z', updated: '2026-11-01T00:00:00Z' })));
  const hits = timed('search', () => searchNotes(notes, 'café "Note 4999" -nothing tag:#tag39'));
  assert.ok(hits.length > 0);
  timed('search (first word)', () => searchNotes(notes, 'words'));
  const q = parseQuery('TASK FROM #tag5 WHERE !completed SORT due LIMIT 50');
  const tasks = timed('query', () => runQuery(q, notes, { now: new Date('2026-11-26T12:00:00Z') }));
  assert.ok(JSON.stringify(tasks).length > 0);
  const g = timed('graph', () => buildGraph(notes));
  assert.ok(g.nodes.length >= N);
  const long = Array.from({ length: 4000 }, (_, i) => (i % 50 === 0 ? `## Part ${i}` : `- item ${i} **bold** [[Note ${i}]] \`code\` #tag`)).join('\n');
  timed('render long note', () => render(long, { frontmatter: true }));
  const base = long;
  const mine = long.replace('item 10 ', 'item ten ');
  const theirs = long.replace('item 3990 ', 'item three thousand nine hundred ninety ');
  const m = timed('merge long note', () => merge3(base, mine, theirs));
  assert.equal(m.conflict, false);
  const files = texts.map((t, i) => ({ path: `notes/Folder ${i % 50}/Note ${i}.md`, data: new TextEncoder().encode(t) }));
  const zip = timed('backup zip', () => makeZip(files));
  assert.equal(timed('read backup zip', () => readZip(zip)).length, N);
  console.log(`5,000 notes (${(zip.length / 1e6).toFixed(1)} MB as a zip): ${JSON.stringify(times)}`);
  const budget = { index: 4000, search: 2000, 'search (first word)': 2000, query: 2000, graph: 4000, 'render long note': 2000, 'merge long note': 3000, 'backup zip': 4000, 'read backup zip': 4000 };
  for (const [k, ms] of Object.entries(budget)) assert.ok(times[k] < ms, `${k}: ${times[k]} ms (budget ${ms})`);
});
