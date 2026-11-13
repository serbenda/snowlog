import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNote } from '../public/js/noteindex.js';
import { buildGraph, localGraph, initLayout, step } from '../public/js/graph.js';

const notes = [
  parseNote({ id: 'a', path: 'Proyectos/Web', text: '[[HU-01]] y [[Proyectos/HU-02]] y [[No existe]] y otra vez [[HU-01]]' }),
  parseNote({ id: 'b', path: 'Proyectos/HU-01', text: 'vuelve a [[Web]]' }),
  parseNote({ id: 'c', path: 'Proyectos/HU-02', text: '[[Reunión]]' }),
  parseNote({ id: 'd', path: 'Reunión', text: 'sin enlaces' }),
  parseNote({ id: 'e', path: 'Suelta', text: 'nadie me enlaza' }),
];

test('nodos y enlaces, sin duplicados ni enlaces rotos', () => {
  const g = buildGraph(notes);
  assert.equal(g.nodes.length, 5);
  const pairs = g.links.map((l) => [g.nodes[l.s].id, g.nodes[l.t].id].sort().join('-')).sort();
  assert.deepEqual(pairs, ['a-b', 'a-c', 'c-d']);
  assert.equal(g.nodes.find((n) => n.id === 'a').deg, 2);
  assert.equal(g.nodes.find((n) => n.id === 'e').deg, 0);
});

test('grafo local: la nota y sus vecinas', () => {
  const g = buildGraph(notes);
  assert.deepEqual(localGraph(g, 'c').nodes.map((n) => n.id).sort(), ['a', 'c', 'd']);
  assert.deepEqual(localGraph(g, 'd', 2).nodes.map((n) => n.id).sort(), ['a', 'c', 'd']);
  assert.deepEqual(localGraph(g, 'd', 3).nodes.map((n) => n.id).sort(), ['a', 'b', 'c', 'd']);
  assert.equal(localGraph(g, 'e').links.length, 0);
});

test('la simulación se estabiliza y separa los nodos', () => {
  const g = initLayout(buildGraph(notes));
  let e = Infinity;
  for (let i = 0; i < 400; i++) e = step(g);
  assert.ok(e < 0.01, `energía ${e}`);
  for (let i = 0; i < g.nodes.length; i++) {
    for (let j = i + 1; j < g.nodes.length; j++) {
      const d = Math.hypot(g.nodes[i].x - g.nodes[j].x, g.nodes[i].y - g.nodes[j].y);
      assert.ok(d > 10, `nodos ${i} y ${j} demasiado juntos`);
    }
  }
  const linked = g.links.map((l) => Math.hypot(g.nodes[l.s].x - g.nodes[l.t].x, g.nodes[l.s].y - g.nodes[l.t].y));
  assert.ok(Math.max(...linked) < 200, 'los enlazados quedan cerca');
});

test('1.000 notas: un paso de simulación es rápido', () => {
  const many = Array.from({ length: 1000 }, (_, i) => parseNote({ id: String(i), path: `N${i}`, text: `[[N${(i * 7) % 1000}]] [[N${(i + 1) % 1000}]]` }));
  const g = initLayout(buildGraph(many));
  const t0 = performance.now();
  step(g);
  assert.ok(performance.now() - t0 < 200);
});
