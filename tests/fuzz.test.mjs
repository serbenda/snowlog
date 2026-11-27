// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// Property tests with random input, for everything that reads text a note, an import or a file may bring.
// Reproducible: a failure prints the seed and the run.
//   FUZZ_SEED=7 node --test tests/fuzz.test.mjs     another seed
//   FUZZ_RUNS=5000 node --test tests/fuzz.test.mjs  more runs per property
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, parseFrontmatter, outline, wordCount } from '../public/js/markdown.js';
import { parseQuery, runQuery } from '../public/js/query.js';
import { parseSearch, searchNotes } from '../public/js/search.js';
import { parseBoard, serializeBoard, isBoard } from '../public/js/kanban.js';
import { makeZip, readZip } from '../public/js/zip.js';
import { merge3 } from '../public/js/merge.js';
import { rewriteLinks } from '../public/js/links.js';
import { parseNote } from '../public/js/noteindex.js';
import { applyTemplate } from '../public/js/templates.js';
import { parseBackup } from '../public/js/backup.js';
import { buildGraph } from '../public/js/graph.js';

const SEED = Number(process.env.FUZZ_SEED) || 1;
const RUNS = Math.max(1, Number(process.env.FUZZ_RUNS) || 300);

// A small seeded generator (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pieces Markdown, links, queries and tricky characters are made of.
const PIECES = [
  '#', '## ', '- ', '* ', '1. ', '- [ ] ', '- [x] ', '> ', '> [!note] ', '```', '```js title', '~~~', '````', '|', '|---|', '\n', '\n\n',
  '**', '*', '_', '~~', '==', '`', '[[', ']]', '[[a|b]]', '![[x.png]]', '[t](', ')', '(', 'http://x.y/', 'javascript:alert(1)',
  '<script>', '</script>', '<img src=x onerror=alert(1)>', '"', "'", '&', '<', '>', '#tag', '#a/b', '^block', '$', '\\', '\t', ' ', '   ',
  '---\n', 'title: x\n', 'tags: [a, b]\n', 'ñ', '😀', '\u0000', '‮', 'é', 'TASK', 'LIST', 'TABLE', 'FROM', 'WHERE', 'SORT', 'LIMIT',
  '"Folder"', '#tag', 'and', 'or', '!', '=', '!=', '<=', 'due', 'completed', 'file.name', '2026-11-26', '-word', 'tag:#x', 'path:A',
  'a', 'b', 'Note', 'Folder/Note', '{{title}}', '{{date}}', '{{date:YYYY}}', '{{', '}}', '%%', '<!--', '-->',
];

function text(r, max = 60) {
  const n = Math.floor(r() * max);
  let s = '';
  for (let i = 0; i < n; i++) {
    s += r() < 0.8 ? PIECES[Math.floor(r() * PIECES.length)] : String.fromCharCode(Math.floor(r() * 0x2ff));
  }
  return s;
}

function check(name, prop) {
  for (let i = 0; i < RUNS; i++) {
    const r = rng(SEED * 1000003 + i);
    try {
      prop(r);
    } catch (err) {
      throw new Error(`[${name}] FUZZ_SEED=${SEED} FUZZ_RUNS=${RUNS} run ${i}: ${err.message.slice(0, 1500)}`, { cause: err });
    }
  }
}

const TAGS = new Set(['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'strong', 'em', 'del', 'mark', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input', 'span', 'div', 'hr', 'details', 'summary', 'label', 'sup', 'section', 'svg', 'path', 'dl', 'dt', 'dd']);

test('Markdown: always finishes quickly, and only safe tags, attributes and links come out', () => {
  check('render', (r) => {
    const src = text(r, 120);
    const t0 = Date.now();
    const html = render(src, { frontmatter: r() < 0.5 });
    assert.ok(Date.now() - t0 < 500, `slow: ${Date.now() - t0} ms for ${JSON.stringify(src).slice(0, 200)}`);
    for (const m of html.matchAll(/<\/?([a-zA-Z0-9]+)([^>]*)>/g)) {
      assert.ok(TAGS.has(m[1].toLowerCase()), `tag <${m[1]}> from ${JSON.stringify(src).slice(0, 200)}`);
      // Attribute names only (quoted values are escaped text, whatever they say).
      const names = m[2].replace(/"[^"]*"|'[^']*'/g, '""');
      assert.ok(!/\son[a-z]+\s*=/i.test(names), `event attribute in ${m[0]}`);
      for (const h of m[2].matchAll(/\s(?:href|src)="([^"]*)"/g)) {
        assert.ok(/^(https?:|mailto:|#|data:image\/|blob:|$)/i.test(h[1]) || !/^[a-z][a-z0-9+.-]*:/i.test(h[1]), `link ${h[1]}`);
      }
    }
    parseFrontmatter(src);
    outline(src);
    wordCount(src);
  });
});

test('queries: parse or say what is wrong; running one never throws', () => {
  const notes = Array.from({ length: 6 }, (_, i) => parseNote({ id: `n${i}`, path: `F/Note ${i}`, text: `- [ ] task #a due:: 2026-11-2${i}\n[[Note ${i + 1}]] #tag`, created: '2026-11-01T00:00:00Z', updated: '2026-11-20T00:00:00Z' }));
  check('query', (r) => {
    const src = ['TASK', 'LIST', 'TABLE'][Math.floor(r() * 3)] + text(r, 15);
    let q;
    try {
      q = parseQuery(src);
    } catch (e) {
      assert.ok(!(e instanceof TypeError) && !(e instanceof RangeError), `${e.constructor.name}: ${e.message} for ${JSON.stringify(src)}`);
      return;
    }
    runQuery(q, notes, { now: new Date('2026-11-26T12:00:00Z') });
  });
});

test('search: never throws, and only returns notes it was given', () => {
  check('search', (r) => {
    // As the app passes them: parsed notes (with their tags and links).
    const notes = Array.from({ length: 4 }, (_, i) => parseNote({ id: `n${i}`, path: `F/${text(r, 4).replace(/\//g, '') || `N${i}`}`, text: text(r, 30) }));
    const res = searchNotes(notes, text(r, 8));
    parseSearch(text(r, 8));
    for (const x of res) assert.ok(notes.some((n) => n.id === (x.note?.id ?? x.id)), 'a note it was given');
  });
});

test('Kanban boards: parsing what was serialized gives the same board', () => {
  check('kanban', (r) => {
    const src = (r() < 0.5 ? '---\nkanban-plugin: basic\n---\n\n' : '') + text(r, 40);
    if (!isBoard(src)) return;
    const once = serializeBoard(parseBoard(src));
    assert.equal(serializeBoard(parseBoard(once)), once);
  });
});

test('zip: random bytes are refused cleanly; what is written reads back', () => {
  check('zip', (r) => {
    const junk = Uint8Array.from({ length: Math.floor(r() * 300) }, () => Math.floor(r() * 256));
    try {
      readZip(junk);
    } catch (e) {
      assert.match(e.message, /bad_zip|zip_compressed/);
    }
    const files = Array.from({ length: 1 + Math.floor(r() * 4) }, (_, i) => ({ path: `d/f${i}-${text(r, 2).replace(/[^\w]/g, '')}.md`, data: new TextEncoder().encode(text(r, 20)) }));
    const back = readZip(makeZip(files));
    assert.deepEqual(back.map((f) => [f.path, [...f.data]]), files.map((f) => [f.path, [...f.data]]));
  });
});

test('merging: one side unchanged gives the other side; both the same gives that', () => {
  check('merge', (r) => {
    const base = text(r, 30);
    const other = text(r, 30);
    assert.deepEqual(merge3(base, base, other), { text: other, conflict: false });
    assert.deepEqual(merge3(base, other, base), { text: other, conflict: false });
    assert.equal(merge3(base, other, other).text, other);
    const m = merge3(base, text(r, 30), text(r, 30));
    assert.equal(typeof m.conflict, 'boolean');
  });
});

test('links, note parsing, templates, backups and the graph never throw on odd text', () => {
  check('misc', (r) => {
    const src = text(r, 60);
    const out = rewriteLinks(src, [{ from: 'Folder/Note', to: 'Other/New', byName: r() < 0.5 }]);
    assert.ok(out === null || typeof out === 'string');
    assert.equal(rewriteLinks(src, []), null);
    const n = parseNote({ id: 'x', path: `F/${text(r, 3) || 'n'}`, text: src });
    buildGraph([n, parseNote({ id: 'y', path: 'F/Note', text: text(r, 20) })]);
    applyTemplate(src, { title: text(r, 4), date: new Date('2026-11-26T10:00:00Z') });
    assert.throws(() => parseBackup(new TextEncoder().encode(src)), /bad_backup/);
  });
});
