import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(mkdtempSync(join(tmpdir(), 'portable-')), 'snowlog-portable.html');
execFileSync(process.execPath, ['scripts/build-portable.mjs', out]);
const html = readFileSync(out, 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>\n<\/body>/)[1];
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)[1];
const sha = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

test('un solo fichero: sin módulos, sin recursos externos', () => {
  assert.ok(!/<script[^>]+src=/.test(html));
  assert.ok(!/<link[^>]+stylesheet/.test(html));
  assert.ok(!/(src|href)="(?!data:|#|snowlog-portable\.html)[^"]+"/.test(html.replace(script, '').replace(style, '')));
  assert.ok(!/^\s*(import|export)\s/m.test(script));
  assert.match(script, /CONFIG\.mode = 'portable';/);
  assert.doesNotThrow(() => new Function(script));
});

test('la CSP prohíbe toda conexión y solo permite su propio código', () => {
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.ok(csp.includes(`script-src ${sha(script)}`));
  assert.ok(csp.includes(`style-src ${sha(style)}`));
  assert.ok(!csp.includes('unsafe'));
});
