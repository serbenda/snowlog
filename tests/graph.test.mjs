// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNote } from '../public/js/noteindex.js';
import { buildGraph, localGraph, initLayout, step } from '../public/js/graph.js';

const notes = [
  parseNote({ id: 'a', path: 'Projects/Web', text: '[[US-01]] and [[Projects/US-02]] and [[Does not exist]] and again [[US-01]]' }),
  parseNote({ id: 'b', path: 'Projects/US-01', text: 'back to [[Web]]' }),
  parseNote({ id: 'c', path: 'Projects/US-02', text: '[[Meeting]]' }),
  parseNote({ id: 'd', path: 'Meeting', text: 'no links' }),
  parseNote({ id: 'e', path: 'Loose', text: 'nobody links to me' }),
];

test('nodes and links, without duplicates or broken links', () => {
  const g = buildGraph(notes);
  assert.equal(g.nodes.length, 5);
  const pairs = g.links.map((l) => [g.nodes[l.s].id, g.nodes[l.t].id].sort().join('-')).sort();
  assert.deepEqual(pairs, ['a-b', 'a-c', 'c-d']);
  assert.equal(g.nodes.find((n) => n.id === 'a').deg, 2);
  assert.equal(g.nodes.find((n) => n.id === 'e').deg, 0);
});

test('local graph: the note and its neighbors', () => {
  const g = buildGraph(notes);
  assert.deepEqual(localGraph(g, 'c').nodes.map((n) => n.id).sort(), ['a', 'c', 'd']);
  assert.deepEqual(localGraph(g, 'd', 2).nodes.map((n) => n.id).sort(), ['a', 'c', 'd']);
  assert.deepEqual(localGraph(g, 'd', 3).nodes.map((n) => n.id).sort(), ['a', 'b', 'c', 'd']);
  assert.equal(localGraph(g, 'e').links.length, 0);
});

test('the simulation settles and keeps nodes apart', () => {
  const g = initLayout(buildGraph(notes));
  let e = Infinity;
  for (let i = 0; i < 400; i++) e = step(g);
  assert.ok(e < 0.01, `energy ${e}`);
  for (let i = 0; i < g.nodes.length; i++) {
    for (let j = i + 1; j < g.nodes.length; j++) {
      const d = Math.hypot(g.nodes[i].x - g.nodes[j].x, g.nodes[i].y - g.nodes[j].y);
      assert.ok(d > 10, `nodes ${i} and ${j} too close`);
    }
  }
  const linked = g.links.map((l) => Math.hypot(g.nodes[l.s].x - g.nodes[l.t].x, g.nodes[l.s].y - g.nodes[l.t].y));
  assert.ok(Math.max(...linked) < 200, 'linked nodes stay close');
});

test('1,000 notes: one simulation step is fast', () => {
  const many = Array.from({ length: 1000 }, (_, i) => parseNote({ id: String(i), path: `N${i}`, text: `[[N${(i * 7) % 1000}]] [[N${(i + 1) % 1000}]]` }));
  const g = initLayout(buildGraph(many));
  const t0 = performance.now();
  step(g);
  assert.ok(performance.now() - t0 < 200);
});
