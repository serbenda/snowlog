// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

test('the service worker stores every module of the web app', () => {
  for (const f of readdirSync(new URL('../public/js/', import.meta.url))) {
    assert.ok(sw.includes(`'js/${f}'`), `js/${f} is missing from sw.js`);
  }
  for (const f of ['index.html', 'css/app.css', 'icon.svg', 'manifest.webmanifest']) assert.ok(sw.includes(`'${f}'`), f);
});

test('the service worker stores nothing from other origins (GitHub, sign-in)', () => {
  assert.match(sw, /url\.origin !== self\.location\.origin\) return;/);
  assert.ok(!/api\.github\.com|workers\.dev/.test(sw));
});
