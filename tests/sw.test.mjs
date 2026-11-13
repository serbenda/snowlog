import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

test('el service worker guarda todos los módulos de la web', () => {
  for (const f of readdirSync(new URL('../public/js/', import.meta.url))) {
    assert.ok(sw.includes(`'js/${f}'`), `falta js/${f} en sw.js`);
  }
  for (const f of ['index.html', 'css/app.css', 'icon.svg', 'manifest.webmanifest']) assert.ok(sw.includes(`'${f}'`), f);
});

test('el service worker no guarda nada de otros orígenes (GitHub, login)', () => {
  assert.match(sw, /url\.origin !== self\.location\.origin\) return;/);
  assert.ok(!/api\.github\.com|workers\.dev/.test(sw));
});
