// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// The interface's languages: every dictionary translates the same strings, keeps their {holes}, and only holds
// strings the code really shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANGS, pickLang, translator, fill, dictionaries } from '../public/js/i18n.js';

const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
// How a string appears in the source: as a JS string literal ('…' with \' escaped) or as HTML text.
const inSource = (s) => app.includes(`'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`) || app.includes(JSON.stringify(s))
  || html.includes(s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')) || html.includes(s);

test('the language: the chosen one, else the browser\'s, else English', () => {
  assert.equal(pickLang('ca', ['fr-FR']), 'ca');
  assert.equal(pickLang('auto', ['pt-PT', 'en']), 'pt');
  assert.equal(pickLang('auto', ['de-DE']), 'en');
  assert.equal(pickLang('xx'), 'en');
  assert.equal(translator('en')('Unlock'), 'Unlock');
  assert.equal(translator('es')('A string nobody translated'), 'A string nobody translated');
  assert.equal(fill('{a} and {b}', { a: 1 }), '1 and {b}');
});

test('every language translates the same strings, keeping their {holes}', () => {
  const keys = Object.keys(dictionaries.es).sort();
  assert.ok(keys.length > 400, `${keys.length} strings`);
  for (const lang of LANGS.filter((l) => l !== 'en')) {
    const d = dictionaries[lang];
    assert.deepEqual(Object.keys(d).sort(), keys, `${lang} has the same strings as es`);
    for (const [k, v] of Object.entries(d)) {
      assert.equal(typeof v, 'string', `${lang}: ${k}`);
      assert.ok(v.trim(), `${lang}: empty translation for ${k}`);
      assert.deepEqual(holes(v), holes(k), `${lang}: the holes of “${k}”`);
    }
  }
});

test('the dictionaries only hold strings the interface shows', () => {
  const orphans = Object.keys(dictionaries.es).filter((k) => !inSource(k));
  assert.deepEqual(orphans, [], 'strings no longer in app.js or index.html');
});
