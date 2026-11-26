// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNote } from '../public/js/noteindex.js';
import { fold, parseSearch, searchNotes, tagCounts } from '../public/js/search.js';

const notes = [
  { id: 'a', path: 'Projects/Recipe website', text: '# Recipe website\nMove 20 recipes to the website #project/web\n- [ ] Review the diseño with Blanca', updated: '2026-11-10' },
  { id: 'b', path: 'Daily/2026-11-13', text: 'Meeting about the front page DISEÑO.\n#meeting', updated: '2026-11-13' },
  { id: 'c', path: 'Recipes', text: 'List of grandma\'s recipes #cooking', updated: '2026-11-01' },
].map(parseNote);

test('folding removes accents and case without changing the length', () => {
  for (const s of ['Diseño Ácido ÑANDÚ', 'emoji 👍 and çà', 'İstanbul ß']) assert.equal(fold(s).length, s.length);
  assert.equal(fold('Diseño ÁCIDO'), 'diseno acido');
});

test('parses terms, phrases, exclusions, tags and paths', () => {
  assert.deepEqual(parseSearch('diseño "front page" -blanca tag:#Meeting path:Daily'), {
    terms: ['diseno', 'front page'], not: ['blanca'], tags: [{ neg: false, tag: 'meeting' }], paths: [{ neg: false, path: 'daily' }],
  });
});

test('searches ignoring accents and case, and gives the context', () => {
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

test('all words, phrases and exclusions', () => {
  assert.deepEqual(searchNotes(notes, 'recipe website').map((x) => x.note.id), ['a']);
  assert.deepEqual(searchNotes(notes, '"grandma\'s recipes"').map((x) => x.note.id), ['c']);
  assert.deepEqual(searchNotes(notes, 'recipes -grandma').map((x) => x.note.id), ['a']);
  assert.equal(searchNotes(notes, '   ').length, 0);
});

test('the name weighs more than the text', () => {
  assert.equal(searchNotes(notes, 'recipes')[0].note.id, 'c');
});

test('filter by tag (with children) and by path', () => {
  assert.deepEqual(searchNotes(notes, 'tag:#project').map((x) => x.note.id), ['a']);
  assert.deepEqual(searchNotes(notes, 'tag:meeting').map((x) => x.note.id), ['b']);
  assert.deepEqual(searchNotes(notes, 'path:daily').map((x) => x.note.id), ['b']);
  assert.deepEqual(searchNotes(notes, 'recipes -path:projects').map((x) => x.note.id), ['c']);
});

test('tag counts', () => {
  const extra = parseNote({ id: 'd', path: 'X', text: '#cooking' });
  assert.deepEqual(tagCounts([...notes, extra])[0], { tag: 'cooking', count: 2 });
});

test('1,000 notes in under 300 ms', () => {
  const words = 'project meeting task diseño web recipe client team review code test delivery'.split(' ');
  const many = Array.from({ length: 1000 }, (_, i) => parseNote({
    id: String(i),
    path: `Folder ${i % 20}/Note ${i}`,
    text: Array.from({ length: 40 }, (_, j) => `- ${words[(i + j) % words.length]} line ${j} with filler text to give it weight #t${j % 7}`).join('\n'),
  }));
  searchNotes(many, 'warm up'); // first time: folds the text of all of them
  // Best of three, so it does not fail if the machine is busy with other tests.
  let best = Infinity;
  let r;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    r = searchNotes(many, 'diseño delivery');
    best = Math.min(best, performance.now() - t0);
  }
  assert.ok(r.length > 0);
  assert.ok(best < 300, `${best.toFixed(0)} ms`);
  const t1 = performance.now();
  searchNotes(many.map((n) => ({ ...n })), 'client');
  const cold = performance.now() - t1;
  assert.ok(cold < 1500, `first search (folding everything): ${cold.toFixed(0)} ms`);
});
