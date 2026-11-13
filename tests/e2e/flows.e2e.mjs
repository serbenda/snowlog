// Recorridos principales en un Chrome de verdad (sin cabeza), contra un GitHub falso en memoria.
// Se ejecutan con `npm run test:e2e` y en la CI. Si no hay Chrome, se saltan.

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
const skip = chrome ? false : 'No hay Chrome (pon CHROME_BIN)';
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

const PASS = 'una frase de paso de prueba';

async function newVault(page) {
  await page.goto(base);
  await page.click('button.link-btn', 'Usar un token personal');
  await page.fill('#pat', 'github_pat_prueba');
  await page.click('button', 'Continuar');
  await page.waitFor('!!document.querySelector("#p1")');
  await page.fill('#p1', PASS);
  await page.fill('#p2', PASS);
  await page.click('button', 'Crear bóveda cifrada');
  await page.waitFor('!!document.querySelector(".recovery-code")', 30000);
  await page.click('#saved');
  await page.click('button', 'Entrar en Snowlog');
  await page.waitFor('!document.querySelector("#note").hidden');
}

async function unlock(page) {
  await page.waitFor('!!document.querySelector("#pp")');
  await page.fill('#pp', PASS);
  await page.click('button', 'Desbloquear');
  await page.waitFor('!document.querySelector("#app").hidden && !document.querySelector("#note").hidden', 30000);
}

const realErrors = (page) => page.errors.filter((e) => !/status of 4(09|22)/.test(e));

test('crear bóveda, escribir, bloquear y volver a entrar: nada en claro en el repo', { skip, timeout: 120000 }, async () => {
  const fake = createFakeGitHub({ owner: 'serbenda', repo: 'snowlog-notes' });
  const page = await browser.newPage({ intercept: fake.fetch });
  await newVault(page);
  await page.press('N', { ctrl: true });
  await page.waitFor('document.activeElement?.id === "title"');
  await page.eval('document.getElementById("title").value = ""');
  await page.type('Plan secreto\n');
  await page.waitFor('document.activeElement?.id === "editor"');
  await page.type('- comprar regalo\nllamar a mamá');
  assert.equal(await page.eval('document.getElementById("editor").value'), '- comprar regalo\n- llamar a mamá', 'Intro continúa la lista');
  await page.press('S', { ctrl: true });
  await page.waitFor('document.getElementById("st-sync").textContent === "Guardado"');
  for (const [path, content] of fake.files()) {
    for (const secret of ['Plan secreto', 'regalo', 'mamá']) assert.ok(!path.includes(secret) && !content.includes(secret), `${path} en claro`);
  }
  await page.click('.ribbon [data-action=lock]');
  assert.equal(await page.eval('document.title'), 'Snowlog');
  await unlock(page);
  await page.click('.tree-row', 'Plan secreto');
  await page.waitFor('document.getElementById("editor").value.includes("llamar a mamá")');
  assert.deepEqual(realErrors(page), []);
  await page.close();
});

test('lectura segura: el HTML de una nota no se ejecuta y la CSP no se queja', { skip, timeout: 120000 }, async () => {
  const fake = createFakeGitHub({ owner: 'serbenda', repo: 'snowlog-notes' });
  const page = await browser.newPage({ intercept: fake.fetch });
  await newVault(page);
  await page.press('N', { ctrl: true });
  await page.press('Enter');
  await page.type('<img src=x onerror="window.__pwned=1"> [x](javascript:window.__pwned=2) **negrita** [[Bienvenido]]');
  await page.press('E', { ctrl: true });
  await page.waitFor('!!document.querySelector("#reading strong")');
  assert.equal(await page.eval('window.__pwned || 0'), 0);
  assert.equal(await page.eval('document.querySelectorAll("#reading img").length'), 0);
  assert.ok(await page.eval('!!document.querySelector("#reading a.internal-link")'));
  assert.deepEqual(realErrors(page), []);
  await page.close();
});

test('ejemplos, consultas, búsqueda y renombrar con enlaces', { skip, timeout: 180000 }, async () => {
  const fake = createFakeGitHub({ owner: 'serbenda', repo: 'snowlog-notes' });
  const page = await browser.newPage({ intercept: fake.fetch });
  await newVault(page);
  await page.click('.view-actions [data-action=note-menu]');
  await page.click('.menu-item', 'Cargar ejemplos');
  await page.click('.modal button', 'Cargar');
  await page.waitFor('document.getElementById("title").value === "Cómo usar este ejemplo"', 60000);
  // Búsqueda en todas las notas
  await page.press('F', { ctrl: true, shift: true });
  await page.type('favoritas');
  await page.waitFor('/\\d+ nota/.test(document.querySelector("#search-results .search-count")?.textContent || "")', 30000);
  assert.ok(await page.eval('document.querySelectorAll("#search-results mark").length > 0'));
  // Renombrar una historia reescribe los enlaces que apuntan a ella
  await page.click('.left-tab[data-tab=files]');
  await page.eval(`${page.sel('.tree-row.is-note', 'HU-02')}.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }))`);
  await page.click('.menu-item', 'Renombrar');
  await page.fill('#mp', 'HU-02 Favoritas');
  await page.press('Enter');
  await page.waitFor('[...document.querySelectorAll(".notice")].some((n) => n.textContent.includes("Enlaces actualizados"))', 30000);
  await page.click('.tree-row.is-note', 'Planificación');
  await page.waitFor('document.getElementById("editor").value.includes("[[HU-02 Favoritas]]") || document.getElementById("reading").textContent.includes("HU-02 Favoritas")', 15000);
  assert.deepEqual(realErrors(page), []);
  await page.close();
});

test('versión portátil: funciona desde el disco y sin ninguna conexión', { skip, timeout: 120000 }, async () => {
  execFileSync(process.execPath, [join(ROOT, 'scripts/build-portable.mjs')], { stdio: 'ignore' });
  const file = join(ROOT, 'dist/snowlog-portable.html');
  assert.ok(existsSync(file));
  // Carpeta en memoria en lugar del selector de carpetas del sistema.
  const memfs = `(() => {
    class F { constructor(n){ this.kind='file'; this.name=n; this.data=new Uint8Array(); this.mtime=Date.now(); }
      async getFile(){ const d=this.data, m=this.mtime; return { size:d.length, lastModified:m, text: async()=>new TextDecoder().decode(d), arrayBuffer: async()=>d.slice().buffer }; }
      async createWritable(){ const ch=[]; return { write: async(x)=>{ ch.push(typeof x==='string'? new TextEncoder().encode(x): new Uint8Array(x)); }, close: async()=>{ const o=new Uint8Array(ch.reduce((a,c)=>a+c.length,0)); let p=0; for(const c of ch){o.set(c,p);p+=c.length;} this.data=o; this.mtime=Date.now(); } }; } }
    class D { constructor(n){ this.kind='directory'; this.name=n; this.c=new Map(); }
      async *entries(){ yield* [...this.c.entries()]; }
      async getDirectoryHandle(n,{create=false}={}){ const h=this.c.get(n); if(h&&h.kind==='directory') return h; if(h||!create){ throw Object.assign(new Error('nf'),{name:'NotFoundError'}); } const d=new D(n); this.c.set(n,d); return d; }
      async getFileHandle(n,{create=false}={}){ const h=this.c.get(n); if(h&&h.kind==='file') return h; if(h||!create){ throw Object.assign(new Error('nf'),{name:'NotFoundError'}); } const f=new F(n); this.c.set(n,f); return f; }
      async removeEntry(n){ this.c.delete(n); } async requestPermission(){ return 'granted'; } }
    const root = new D('Notas'); window.__root = root; window.showDirectoryPicker = async () => root;
  })();`;
  const page = await browser.newPage({ initScript: memfs, offline: true });
  await page.goto(`file://${file}`);
  await page.click('button', 'Abrir una carpeta');
  await page.waitFor('!document.querySelector("#app").hidden');
  await page.press('N', { ctrl: true });
  await page.press('Enter');
  await page.type('escrita sin red');
  await page.press('S', { ctrl: true });
  await page.waitFor('window.__root.c.has("Sin título.md")');
  assert.equal(await page.eval('new TextDecoder().decode(window.__root.c.get("Sin título.md").data)'), 'escrita sin red');
  assert.deepEqual(page.requests.filter((u) => !u.startsWith('file:') && !u.startsWith('data:')), [], 'ninguna petición de red');
  assert.deepEqual(realErrors(page), []);
  await page.close();
});

test('rotar la clave en un dispositivo: el otro pide la frase y no pierde lo que estaba escribiendo', { skip, timeout: 180000 }, async () => {
  const fake = createFakeGitHub({ owner: 'serbenda', repo: 'snowlog-notes' });
  const a = await browser.newPage({ intercept: fake.fetch });
  await newVault(a);
  await a.press('N', { ctrl: true });
  await a.waitFor('document.activeElement?.id === "title"');
  await a.eval('document.getElementById("title").value = ""');
  await a.type('Compartida\n');
  await a.fill('#editor', 'línea uno\nlínea dos\nlínea tres');
  await a.press('S', { ctrl: true });
  await a.waitFor('document.getElementById("st-sync").textContent === "Guardado"');

  // Segundo dispositivo con la nota abierta.
  const b = await browser.newPage({ intercept: fake.fetch });
  await b.goto(base);
  await b.click('button.link-btn', 'Usar un token personal');
  await b.fill('#pat', 'github_pat_prueba');
  await b.click('button', 'Continuar');
  await unlock(b);
  await b.click('.tree-row', 'Compartida');
  await b.waitFor('document.getElementById("editor").value.includes("línea dos")');

  // A rota la clave.
  const before = new Map(fake.files());
  await a.click('.view-actions [data-action=note-menu]');
  await a.click('.menu-item', 'Frase de paso y recuperación');
  await a.click('.modal button', 'Cambiar la clave de cifrado');
  await a.fill('#rk0', PASS);
  await a.click('.modal button', 'Recifrar todo');
  await a.waitFor('!!document.querySelector(".modal .recovery-code")', 60000);
  await a.click('#saved2');
  await a.click('.modal button', 'Hecho');
  for (const [path, content] of fake.files()) if (/^n\//.test(path)) assert.notEqual(content, before.get(path));

  // B, que no sabe nada, sigue escribiendo y guarda: se bloquea pidiendo la frase…
  await b.fill('#editor', 'línea uno\nlínea dos\nlínea tres\nescrito en B');
  await b.press('S', { ctrl: true });
  await b.waitFor('!!document.querySelector("#pp") && document.querySelector(".lock-card").textContent.includes("clave de cifrado se ha cambiado")', 30000);
  // …y al volver a entrar, lo que escribió se sube (con la clave nueva).
  await unlock(b);
  await b.waitFor('[...document.querySelectorAll(".notice")].some((n) => n.textContent.includes("Conexión recuperada") || n.textContent.includes("subido"))', 30000);
  await b.click('.tree-row', 'Compartida');
  await b.waitFor('document.getElementById("editor").value.includes("escrito en B")', 15000);
  // A también lo ve, y el historial anterior a la rotación se sigue leyendo.
  await a.click('.ribbon [data-action=lock]');
  await unlock(a);
  await a.click('.tree-row', 'Compartida');
  await a.waitFor('document.getElementById("editor").value.includes("escrito en B")', 15000);
  assert.deepEqual(realErrors(a), []);
  assert.deepEqual(realErrors(b).filter((e) => !e.includes('OperationError')), []);
  await a.close();
  await b.close();
});
