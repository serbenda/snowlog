// Main flows in a real (headless) Chrome, against a fake in-memory GitHub.
// They run with `npm run test:e2e` and in the CI. Without Chrome, they are skipped.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, findChrome } from './cdp.mjs';
import { createFakeGitHub } from '../fake-github.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const chrome = findChrome();
const skip = chrome ? false : 'No Chrome (set CHROME_BIN)';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

let server;
let base;
let browser;

before(async () => {
  if (skip) return;
  server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(PUBLIC, path.endsWith('/') ? `${path}index.html` : path);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://localhost:${server.address().port}/`;
  browser = await launch(chrome);
});

after(async () => {
  await browser?.close();
  server?.close();
});

const PASS = 'a test passphrase';

async function newVault(page) {
  await page.goto(base);
  await page.click('button.link-btn', 'Use a personal token');
  await page.fill('#pat', 'github_pat_test');
  await page.click('button', 'Continue');
  await page.waitFor('!!document.querySelector("#p1")');
  await page.fill('#p1', PASS);
  await page.fill('#p2', PASS);
  await page.click('button', 'Create encrypted vault');
  await page.waitFor('!!document.querySelector(".recovery-code")', 30000);
  await page.click('#saved');
  await page.click('button', 'Enter Snowlog');
  await page.waitFor('!document.querySelector("#note").hidden');
}

async function unlock(page) {
  await page.waitFor('!!document.querySelector("#pp")');
  await page.fill('#pp', PASS);
  await page.click('button', 'Unlock');
  await page.waitFor('!document.querySelector("#app").hidden && !document.querySelector("#note").hidden', 30000);
}

const realErrors = (page) => page.errors.filter((e) => !/status of 4(09|22)/.test(e));

test('create a vault, write, lock and enter again: nothing in plaintext in the repository', { skip, timeout: 120000 }, async () => {
  const fake = createFakeGitHub({ owner: 'serbenda', repo: 'snowlog-notes' });
  const page = await browser.newPage({ intercept: fake.fetch });
  await newVault(page);
  await page.press('N', { ctrl: true });
  await page.waitFor('document.activeElement?.id === "title"');
  await page.eval('document.getElementById("title").value = ""');
  await page.type('Secret plan\n');
  await page.waitFor('document.activeElement?.id === "editor"');
  await page.type('- buy a present\ncall mamá');
  assert.equal(await page.eval('document.getElementById("editor").value'), '- buy a present\n- call mamá', 'Enter continues the list');
  await page.press('S', { ctrl: true });
  await page.waitFor('document.getElementById("st-sync").textContent === "Saved"');
  for (const [path, content] of fake.files()) {
    for (const secret of ['Secret plan', 'present', 'mamá']) assert.ok(!path.includes(secret) && !content.includes(secret), `${path} in plaintext`);
  }
  await page.click('.ribbon [data-action=lock]');
  assert.equal(await page.eval('document.title'), 'Snowlog');
  await unlock(page);
  await page.click('.tree-row', 'Secret plan');
  await page.waitFor('document.getElementById("editor").value.includes("call mamá")');
  assert.deepEqual(realErrors(page), []);
  await page.close();
});

test('safe reading: a note\'s HTML does not run and the CSP does not complain', { skip, timeout: 120000 }, async () => {
  const fake = createFakeGitHub({ owner: 'serbenda', repo: 'snowlog-notes' });
  const page = await browser.newPage({ intercept: fake.fetch });
  await newVault(page);
  await page.press('N', { ctrl: true });
  await page.press('Enter');
  await page.type('<img src=x onerror="window.__pwned=1"> [x](javascript:window.__pwned=2) **bold** [[Welcome]]');
  await page.press('E', { ctrl: true });
  await page.waitFor('!!document.querySelector("#reading strong")');
  assert.equal(await page.eval('window.__pwned || 0'), 0);
  assert.equal(await page.eval('document.querySelectorAll("#reading img").length'), 0);
  assert.ok(await page.eval('!!document.querySelector("#reading a.internal-link")'));
  assert.deepEqual(realErrors(page), []);
  await page.close();
});

test('examples, queries, search and renaming with links', { skip, timeout: 180000 }, async () => {
  const fake = createFakeGitHub({ owner: 'serbenda', repo: 'snowlog-notes' });
  const page = await browser.newPage({ intercept: fake.fetch });
  await newVault(page);
  await page.click('.view-actions [data-action=note-menu]');
  await page.click('.menu-item', 'Load examples');
  await page.click('.modal button', 'Load');
  await page.waitFor('document.getElementById("title").value === "How to use this example"', 60000);
  // Search across all notes
  await page.press('F', { ctrl: true, shift: true });
  await page.type('favorites');
  await page.waitFor('/\\d+ note/.test(document.querySelector("#search-results .search-count")?.textContent || "")', 30000);
  assert.ok(await page.eval('document.querySelectorAll("#search-results mark").length > 0'));
  // Renaming a story rewrites the links that point to it
  await page.click('.left-tab[data-tab=files]');
  await page.eval(`${page.sel('.tree-row.is-note', 'US-02')}.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }))`);
  await page.click('.menu-item', 'Rename');
  await page.fill('#mp', 'US-02 Favorites');
  await page.press('Enter');
  await page.waitFor('[...document.querySelectorAll(".notice")].some((n) => n.textContent.includes("Links updated"))', 30000);
  await page.click('.tree-row.is-note', 'Sprint 1 planning');
  await page.waitFor('document.getElementById("editor").value.includes("[[US-02 Favorites]]") || document.getElementById("reading").textContent.includes("US-02 Favorites")', 15000);
  assert.deepEqual(realErrors(page), []);
  await page.close();
});

test('portable version: works from disk and without any connection', { skip, timeout: 120000 }, async () => {
  execFileSync(process.execPath, [join(ROOT, 'scripts/build-portable.mjs')], { stdio: 'ignore' });
  const file = join(ROOT, 'dist/snowlog-portable.html');
  assert.ok(existsSync(file));
  // An in-memory folder instead of the system folder picker.
  const memfs = `(() => {
    class F { constructor(n){ this.kind='file'; this.name=n; this.data=new Uint8Array(); this.mtime=Date.now(); }
      async getFile(){ const d=this.data, m=this.mtime; return { size:d.length, lastModified:m, text: async()=>new TextDecoder().decode(d), arrayBuffer: async()=>d.slice().buffer }; }
      async createWritable(){ const ch=[]; return { write: async(x)=>{ ch.push(typeof x==='string'? new TextEncoder().encode(x): new Uint8Array(x)); }, close: async()=>{ const o=new Uint8Array(ch.reduce((a,c)=>a+c.length,0)); let p=0; for(const c of ch){o.set(c,p);p+=c.length;} this.data=o; this.mtime=Date.now(); } }; } }
    class D { constructor(n){ this.kind='directory'; this.name=n; this.c=new Map(); }
      async *entries(){ yield* [...this.c.entries()]; }
      async getDirectoryHandle(n,{create=false}={}){ const h=this.c.get(n); if(h&&h.kind==='directory') return h; if(h||!create){ throw Object.assign(new Error('nf'),{name:'NotFoundError'}); } const d=new D(n); this.c.set(n,d); return d; }
      async getFileHandle(n,{create=false}={}){ const h=this.c.get(n); if(h&&h.kind==='file') return h; if(h||!create){ throw Object.assign(new Error('nf'),{name:'NotFoundError'}); } const f=new F(n); this.c.set(n,f); return f; }
      async removeEntry(n){ this.c.delete(n); } async requestPermission(){ return 'granted'; } }
    const root = new D('Notes'); window.__root = root; window.showDirectoryPicker = async () => root;
  })();`;
  const page = await browser.newPage({ initScript: memfs, offline: true });
  await page.goto(`file://${file}`);
  await page.click('button', 'Open a folder');
  await page.waitFor('!document.querySelector("#app").hidden');
  await page.press('N', { ctrl: true });
  await page.press('Enter');
  await page.type('written offline');
  await page.press('S', { ctrl: true });
  await page.waitFor('window.__root.c.has("Untitled.md")');
  assert.equal(await page.eval('new TextDecoder().decode(window.__root.c.get("Untitled.md").data)'), 'written offline');
  assert.deepEqual(page.requests.filter((u) => !u.startsWith('file:') && !u.startsWith('data:')), [], 'no network requests');
  assert.deepEqual(realErrors(page), []);
  await page.close();
});

test('rotating the key on one device: the other asks for the passphrase and does not lose what it was writing', { skip, timeout: 180000 }, async () => {
  const fake = createFakeGitHub({ owner: 'serbenda', repo: 'snowlog-notes' });
  const a = await browser.newPage({ intercept: fake.fetch });
  await newVault(a);
  await a.press('N', { ctrl: true });
  await a.waitFor('document.activeElement?.id === "title"');
  await a.eval('document.getElementById("title").value = ""');
  await a.type('Shared\n');
  await a.fill('#editor', 'line one\nline two\nline three');
  await a.press('S', { ctrl: true });
  await a.waitFor('document.getElementById("st-sync").textContent === "Saved"');

  // A second device with the note open.
  const b = await browser.newPage({ intercept: fake.fetch });
  await b.goto(base);
  await b.click('button.link-btn', 'Use a personal token');
  await b.fill('#pat', 'github_pat_test');
  await b.click('button', 'Continue');
  await unlock(b);
  await b.click('.tree-row', 'Shared');
  await b.waitFor('document.getElementById("editor").value.includes("line two")');

  // A rotates the key.
  const before = new Map(fake.files());
  await a.click('.view-actions [data-action=note-menu]');
  await a.click('.menu-item', 'Passphrase and recovery');
  await a.click('.modal button', 'Change the encryption key');
  await a.fill('#rk0', PASS);
  await a.click('.modal button', 'Re-encrypt everything');
  await a.waitFor('!!document.querySelector(".modal .recovery-code")', 60000);
  await a.click('#saved2');
  await a.click('.modal button', 'Done');
  for (const [path, content] of fake.files()) if (/^n\//.test(path)) assert.notEqual(content, before.get(path));

  // B, which knows nothing, keeps writing and saves: it locks, asking for the passphrase…
  await b.fill('#editor', 'line one\nline two\nline three\nwritten on B');
  await b.press('S', { ctrl: true });
  await b.waitFor('!!document.querySelector("#pp") && document.querySelector(".lock-card").textContent.includes("encryption key was changed")', 30000);
  // …and on entering again, what it wrote is uploaded (with the new key).
  await unlock(b);
  await b.waitFor('[...document.querySelectorAll(".notice")].some((n) => n.textContent.includes("Back online") || n.textContent.includes("uploaded"))', 30000);
  await b.click('.tree-row', 'Shared');
  await b.waitFor('document.getElementById("editor").value.includes("written on B")', 15000);
  // A sees it too, and the history from before the rotation is still readable.
  await a.click('.ribbon [data-action=lock]');
  await unlock(a);
  await a.click('.tree-row', 'Shared');
  await a.waitFor('document.getElementById("editor").value.includes("written on B")', 15000);
  assert.deepEqual(realErrors(a), []);
  assert.deepEqual(realErrors(b).filter((e) => !e.includes('OperationError')), []);
  await a.close();
  await b.close();
});
