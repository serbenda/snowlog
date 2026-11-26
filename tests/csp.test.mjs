// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CONFIG } from '../public/js/config.js';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const csp = Object.fromEntries(html.match(/Content-Security-Policy" content="([^"]+)"/)[1]
  .split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));

test('the online CSP is strict', () => {
  assert.deepEqual(csp['default-src'], ["'none'"]);
  assert.deepEqual(csp['script-src'], ["'self'"]);
  assert.deepEqual(csp['style-src'], ["'self'"]);
  assert.deepEqual(csp['base-uri'], ["'none'"]);
  assert.deepEqual(csp['form-action'], ["'none'"]);
  assert.deepEqual(csp['require-trusted-types-for'], ["'script'"]);
  assert.deepEqual(csp['trusted-types'], ['snowlog']);
  assert.ok(!html.includes('unsafe-'), 'no unsafe-inline or unsafe-eval');
});

test('it only connects to GitHub and the configured Worker, nothing else', () => {
  const allowed = ['https://api.github.com', new URL(CONFIG.authWorker).origin];
  assert.deepEqual(csp['connect-src'].sort(), allowed.sort());
  assert.ok(!csp['connect-src'].some((s) => s.includes('*')), 'no wildcards');
});

test('the app HTML is only written through the Trusted Types policy', () => {
  for (const f of readdirSync(new URL('../public/js/', import.meta.url))) {
    const src = readFileSync(new URL(`../public/js/${f}`, import.meta.url), 'utf8');
    for (const line of src.split('\n')) {
      if (/\.innerHTML\s*=/.test(line)) assert.match(line, /innerHTML = trusted\(/, `${f}: ${line.trim()}`);
      assert.ok(!/outerHTML\s*=|insertAdjacentHTML|\beval\(|new Function\(/.test(line), `${f}: ${line.trim()}`);
    }
  }
});
