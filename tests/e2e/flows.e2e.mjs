// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
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

// A second device: signed in with a personal token, on the unlock screen.
async function otherDevice(fake) {
  const b = await browser.newPage({ intercept: fake.fetch });
  await b.goto(base);
  await b.click('button.link-btn', 'Use a personal token');
  await b.fill('#pat', 'github_pat_test');
  await b.click('button', 'Continue');
  await b.waitFor('!!document.querySelector("#pp")');
  return b;
}

test('forgot the passphrase: the recovery code sets a new one, on another device', { skip, timeout: 180000 }, async () => {
  const fake = createFakeGitHub({ owner: 'serbenda', repo: 'snowlog-notes' });
  const a = await browser.newPage({ intercept: fake.fetch });
  await a.goto(base);
  await a.click('button.link-btn', 'Use a personal token');
  await a.fill('#pat', 'github_pat_test');
  await a.click('button', 'Continue');
  await a.waitFor('!!document.querySelector("#p1")');
  await a.fill('#p1', PASS);
  await a.fill('#p2', PASS);
  await a.click('button', 'Create encrypted vault');
  await a.waitFor('!!document.querySelector(".recovery-code")', 30000);
  const code = await a.eval('document.querySelector(".recovery-code").textContent.trim()');
  await a.click('#saved');
  await a.click('button', 'Enter Snowlog');
  await a.waitFor('!document.querySelector("#note").hidden');

  const b = await otherDevice(fake);
  await b.click('button.link-btn', 'I forgot the passphrase');
  await b.fill('#rc', code);
  await b.fill('#n1', 'a brand new passphrase');
  await b.fill('#n2', 'a brand new passphrase');
  await b.click('button', 'Change the passphrase and enter');
  await b.waitFor('!document.querySelector("#app").hidden && !document.querySelector("#note").hidden', 60000);
  // The new passphrase is the one in the repository: on the first device the old one no longer opens it.
  await a.click('.ribbon [data-action=lock]');
  await a.waitFor('!!document.querySelector("#pp")');
  await a.fill('#pp', PASS);
  await a.click('button', 'Unlock');
  await a.waitFor('document.querySelector(".lock-card").textContent.includes("passphrase was changed on another device")', 60000);
  await a.fill('#pp', 'a brand new passphrase');
  await a.click('button', 'Unlock');
  await a.waitFor('!document.querySelector("#app").hidden', 60000);
  assert.deepEqual(realErrors(a), []);
  assert.deepEqual(realErrors(b), []);
  await a.close();
  await b.close();
});

test('a vault.json from before a key rotation, put back in the repository, is refused', { skip, timeout: 180000 }, async () => {
  const fake = createFakeGitHub({ owner: 'serbenda', repo: 'snowlog-notes' });
  const a = await browser.newPage({ intercept: fake.fetch });
  await newVault(a);
  const old = fake.files().get('.snowlog/vault.json');
  await a.click('.view-actions [data-action=note-menu]');
  await a.click('.menu-item', 'Passphrase and recovery');
  await a.click('.modal button', 'Change the encryption key');
  await a.fill('#rk0', PASS);
  await a.click('.modal button', 'Re-encrypt everything');
  await a.waitFor('!!document.querySelector(".modal .recovery-code")', 60000);
  await a.click('#saved2');
  await a.click('.modal button', 'Done');
  const rotated = fake.files().get('.snowlog/vault.json');
  // Someone with write access to the repository puts the old one back (it opens with the same passphrase).
  fake.externalWrite('.snowlog/vault.json', old);
  await a.click('.ribbon [data-action=lock]');
  await unlock(a);
  await a.waitFor('[...document.querySelectorAll(".notice")].some((n) => n.textContent.includes("older than the one this device last opened"))', 30000);
  // The notes still open with the key this device trusts, and its copy of vault.json is still the rotated one.
  await a.click('.tree-row', 'Welcome');
  await a.waitFor('document.getElementById("editor").value.length > 0 || document.getElementById("reading").textContent.length > 0', 15000);
  assert.equal(await a.eval('localStorage.getItem("snowlog.vault")'), JSON.stringify(JSON.parse(rotated)));
  assert.deepEqual(realErrors(a).filter((e) => !e.includes('OperationError')), []);
  await a.close();
});

test('a vault with 2,000 notes opens and the switcher finds a note quickly', { skip, timeout: 240000 }, async () => {
  const fake = createFakeGitHub({ owner: 'serbenda', repo: 'snowlog-notes' });
  // Made in Node with the app's own code, through the same fake GitHub.
  const prev = globalThis.fetch;
  globalThis.fetch = fake.fetch;
  const C = await import('../../public/js/crypto.js');
  const { GitHubRepo } = await import('../../public/js/github.js');
  const { Vault } = await import('../../public/js/vault.js');
  const repo = new GitHubRepo({ owner: 'serbenda', repo: 'snowlog-notes', branch: 'main' }, async () => 'token');
  const { vault } = await Vault.create(repo, PASS, C.KDF_LIMITS.min);
  await vault.importNotes(Array.from({ length: 2000 }, (_, i) => ({ path: `Area ${i % 40}/Note ${i}`, text: `# Note ${i}\n[[Note ${(i + 1) % 2000}]] #t${i % 30}\n- [ ] task ${i}` })), { batchSize: 500 });
  globalThis.fetch = prev;

  const b = await otherDevice(fake);
  const t0 = Date.now();
  await b.fill('#pp', PASS);
  await b.click('button', 'Unlock');
  await b.waitFor('!document.querySelector("#app").hidden && document.querySelectorAll(".tree-row").length > 10', 120000);
  const open = Date.now() - t0;
  await b.click('.ribbon [data-action=switcher]');
  // Typed once the switcher's field has the focus (on a slow machine it opens a moment later).
  await b.waitFor('document.activeElement?.closest?.("#modal-root") && document.activeElement.tagName === "INPUT"', 15000);
  const t1 = Date.now();
  await b.type('Note 1999');
  await b.waitFor('[...document.querySelectorAll(".switcher-list *")].some((n) => n.textContent.includes("Note 1999"))', 30000);
  const find = Date.now() - t1;
  console.log(`2,000 notes: unlocked and shown in ${open} ms; switcher found one in ${find} ms`);
  assert.ok(open < 60000, `open: ${open} ms`);
  assert.ok(find < 5000, `switcher: ${find} ms`);
  assert.deepEqual(realErrors(b), []);
  await b.close();
});

test('help: "?" or the palette open a short guide and every shortcut; not while typing', { skip, timeout: 120000 }, async () => {
  const fake = createFakeGitHub({ owner: 'serbenda', repo: 'snowlog-notes' });
  const page = await browser.newPage({ intercept: fake.fetch });
  await newVault(page);
  // In the editor, "?" is just a character.
  await page.eval('document.getElementById("editor").focus()');
  await page.type('?');
  assert.equal(await page.eval('document.querySelector(".help-modal")'), null);
  // Outside a field, it opens the help.
  await page.eval('document.activeElement.blur(); document.body.focus()');
  await page.press('?', { shift: true });
  await page.waitFor('!!document.querySelector(".help-modal")');
  assert.ok(await page.eval('document.querySelectorAll(".help-modal tbody tr").length') >= 15);
  assert.equal(await page.eval('document.querySelector(".help-modal").getAttribute("role")'), 'dialog');
  await page.press('Escape');
  await page.waitFor('!document.querySelector(".help-modal")');
  // From the palette.
  await page.press('P', { ctrl: true });
  await page.type('help');
  await page.press('Enter');
  await page.waitFor('!!document.querySelector(".help-modal")');
  assert.deepEqual(realErrors(page), []);
  await page.close();
});

// The interface in each language: nothing of it is left in English (the notes are the user's, not the interface's).
for (const [lang, unlockWord] of [['es', 'Desbloquear'], ['ca', 'Desbloqueja'], ['fr', 'Déverrouiller'], ['pt', 'Desbloquear']]) {
  test(`the interface in ${lang}: unlock, the app, the palette, settings and help, with no English left`, { skip, timeout: 180000 }, async () => {
    const fake = createFakeGitHub({ owner: 'serbenda', repo: 'snowlog-notes' });
    const page = await browser.newPage({ intercept: fake.fetch });
    await newVault(page);
    await page.eval(`localStorage.setItem('snowlog.lang', '${lang}')`);
    await page.goto(base);
    await page.waitFor('!!document.querySelector("#pp")');
    assert.equal(await page.eval('document.documentElement.lang'), lang);
    assert.ok(await page.eval(`document.querySelector('.lock-card').textContent.includes(${JSON.stringify(unlockWord)})`), 'the unlock screen');
    await page.fill('#pp', PASS);
    await page.eval('document.querySelector(".lock-card form").requestSubmit()');
    await page.waitFor('!document.querySelector("#app").hidden && !document.querySelector("#note").hidden', 60000);
    // Words that only English has (case-sensitive, whole words), in the interface's own text.
    // (Whole words only: "Cancel·la" is Catalan; "Notes" and "Note" are words in French and Catalan too.)
    const ENGLISH = /(?<![\p{L}·'])(the|and|with|Search|Settings|Open|Save|Delete|Unlock|Folder|Backup|Help|Today|Close|Cancel|Rename|Graph|reminder|every)(?![\p{L}·'])/u;
    const scan = () => page.eval(`[...document.querySelectorAll('button, label, h1, h2, h3, caption, th, td, li, p, option, small, [aria-label], [title], [placeholder]')]
      .filter((n) => !n.closest('#editor, #reading, .tree, .switcher-item .switcher-path, .breadcrumb, .bookmarks, #title, datalist, .search-results') && n.offsetParent !== null)
      .flatMap((n) => [n.getAttribute('aria-label'), n.getAttribute('title'), n.getAttribute('placeholder'), n.children.length ? '' : n.textContent])
      .map((x) => (x || '').trim()).filter((x) => ${ENGLISH}.test(x))`);
    const found = new Set(await scan());
    for (const [action, then] of [['palette', null], ['settings', null], ['switcher', null]]) {
      await page.click(`.ribbon [data-action=${action}]`);
      await page.waitFor('!!document.querySelector("#modal-root").childElementCount');
      for (const x of await scan()) found.add(`${action}: ${x}`);
      await page.press('Escape');
      void then;
    }
    await page.eval('document.activeElement.blur(); document.body.focus()');
    await page.press('?', { shift: true });
    await page.waitFor('!!document.querySelector(".help-modal")');
    for (const x of await scan()) found.add(`help: ${x}`);
    assert.deepEqual([...found], [], `still in English: ${[...found].join(' | ')}`);
    assert.deepEqual(realErrors(page), []);
    await page.close();
  });
}
