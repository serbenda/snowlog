// Acceso de agentes y scripts a la bóveda (agent/): repo git local, sesión, operaciones y servidor MCP.
// Todo contra una bóveda de prueba en una carpeta temporal: un remoto «bare» y clones que hacen de
// dispositivos.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GitDirRepo } from '../agent/gitdir.js';
import { Session } from '../agent/session.js';
import * as ops from '../agent/ops.js';
import { createServer } from '../agent/mcp.js';
import { askPassphrase } from '../agent/askpass.js';
import { Vault } from '../public/js/vault.js';
import * as C from '../public/js/crypto.js';

const ITER = 1000;
const SECRET = 'frase de prueba muy secreta';
let root;
let remote;

const sh = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function newClone(name) {
  const dir = join(root, name);
  execFileSync('git', ['init', '-q', '-b', 'main', dir]);
  sh(dir, 'config', 'user.name', 'Prueba');
  sh(dir, 'config', 'user.email', 'prueba@example.com');
  sh(dir, 'remote', 'add', 'origin', remote);
  return dir;
}

function newSession(dir, { answers = [SECRET], ...opts } = {}) {
  const asked = [];
  const queue = [...answers];
  const session = new Session({
    repo: new GitDirRepo({ dir }),
    askPassphrase: async (msg) => {
      asked.push(msg);
      return queue.length ? queue.shift() : null;
    },
    refreshMs: 0,
    ...opts,
  });
  return { session, asked };
}

let agentDir;
let s;

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'snowlog-agent-'));
  remote = join(root, 'remote.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  // La bóveda se crea con la misma función que usa la app, desde otro «dispositivo».
  const app = newClone('app');
  await Vault.create(new GitDirRepo({ dir: app }), SECRET, ITER);
  agentDir = newClone('agent');
  ({ session: s } = newSession(agentDir));
});

after(() => {
  s?.lock();
  if (root) rmSync(root, { recursive: true, force: true });
});

test('estado sin desbloquear: no pide la frase', async () => {
  const { session, asked } = newSession(agentDir);
  assert.deepEqual(await ops.status(session), { unlocked: false, reason: null });
  assert.equal(asked.length, 0);
});

test('desbloquear: frase incorrecta, reintento y cancelación', async () => {
  const ok = newSession(agentDir, { answers: ['mala', SECRET] });
  const st = await ops.unlock(ok.session);
  assert.equal(st.unlocked, true);
  assert.equal(ok.asked.length, 2);
  assert.match(ok.asked[1], /incorrecta/);

  const bad = newSession(agentDir, { answers: ['a', 'b', 'c'] });
  await assert.rejects(ops.unlock(bad.session), (e) => e.code === 'bad_secret' && !e.message.includes('a'.repeat(2)));

  const cancel = newSession(agentDir, { answers: [] });
  await assert.rejects(ops.listNotes(cancel.session), (e) => e.code === 'cancelled');
});

test('listar y leer la nota de bienvenida creada por la app', async () => {
  const list = await ops.listNotes(s);
  assert.deepEqual(list.notes.map((n) => n.path), ['Bienvenido']);
  const n = await ops.readNote(s, { path: '[[Bienvenido]]' });
  assert.match(n.text, /cifrado de extremo a extremo/);
  await assert.rejects(ops.readNote(s, { path: 'No existe' }), (e) => e.code === 'not_found');
});

test('crear notas, seguir enlaces y enlaces entrantes', async () => {
  await ops.createNote(s, { path: 'Proyectos/Idea', text: '# Idea\nVer [[Bienvenido]] y [[Nada]].\n\n## Tareas\n- [ ] probar #agente\n\n## Notas\nfin\n' });
  await ops.createNote(s, { path: 'Proyectos/Otra.md', text: 'Relacionada con [[Proyectos/Idea|la idea]]' });
  await assert.rejects(ops.createNote(s, { path: 'Proyectos/Idea' }), (e) => e.code === 'exists');
  await assert.rejects(ops.createNote(s, { path: 'Mal: nombre' }), (e) => e.code === 'bad_chars');

  const out = await ops.links(s, { path: 'Idea' });
  assert.deepEqual(out.links.map((l) => [l.target, l.path]), [['Bienvenido', 'Bienvenido'], ['Nada', null]]);
  assert.equal(out.unresolved, 1);

  const back = await ops.backlinks(s, { path: 'Idea' });
  assert.deepEqual(back.backlinks.map((b) => b.path), ['Proyectos/Otra']);
  assert.equal(back.backlinks[0].lines[0].line, 1);
  const welcome = await ops.backlinks(s, { path: 'Bienvenido' });
  assert.deepEqual(welcome.backlinks.map((b) => b.path), ['Proyectos/Idea']);

  const list = await ops.listNotes(s, { folder: 'Proyectos', recursive: false });
  assert.deepEqual(list.notes.map((n) => n.path), ['Proyectos/Idea', 'Proyectos/Otra']);
});

test('buscar sin acentos y por etiqueta; listar etiquetas', async () => {
  const r = await ops.search(s, { query: 'PROBAR tag:#agente' });
  assert.equal(r.total, 1);
  assert.equal(r.results[0].path, 'Proyectos/Idea');
  assert.equal(r.results[0].matches[0].line, 5);
  assert.equal((await ops.search(s, { query: 'extremo' })).results[0].path, 'Bienvenido');
  assert.deepEqual((await ops.listTags(s)).tags.find((t) => t.tag === 'agente'), { tag: 'agente', count: 1 });
});

test('añadir al final o dentro de una sección', async () => {
  await ops.appendNote(s, { path: 'Idea', text: '- [ ] otra tarea', heading: 'Tareas' });
  await ops.appendNote(s, { path: 'Idea', text: 'Última línea' });
  const { text } = await ops.readNote(s, { path: 'Idea' });
  assert.equal(text, '# Idea\nVer [[Bienvenido]] y [[Nada]].\n\n## Tareas\n- [ ] probar #agente\n- [ ] otra tarea\n\n## Notas\nfin\nÚltima línea\n');
  await assert.rejects(ops.appendNote(s, { path: 'Idea', text: 'x', heading: 'No hay' }), (e) => e.code === 'heading_not_found');
});

test('appendText respeta subsecciones y bloques de código', () => {
  const doc = '## A\nuno\n### A1\ndos\n\n```\n## A\n```\n## B\ntres';
  assert.equal(ops.appendText(doc, 'nuevo', 'A'), '## A\nuno\n### A1\ndos\n\n```\n## A\n```\nnuevo\n\n## B\ntres\n');
  assert.equal(ops.appendText('', 'hola'), 'hola\n');
});

test('nota diaria desde la plantilla del diario', async () => {
  const d = await ops.dailyNote(s, { date: '2026-11-13' });
  assert.equal(d.path, 'Diario/2026-11-13');
  assert.equal(d.created, true);
  assert.match(d.text, /date: 2026-11-13/);
  assert.match(d.text, /# viernes, 13 de noviembre de 2026/);
  const again = await ops.dailyNote(s, { date: '2026-11-13' });
  assert.equal(again.created, false);
  assert.deepEqual(await ops.dailyNote(s, { date: '2026-11-14', create: false }), { path: 'Diario/2026-11-14', created: false, exists: false });
  await assert.rejects(ops.dailyNote(s, { date: 'mañana' }), (e) => e.code === 'bad_date');
});

test('la app lee lo que escribe el agente y el agente ve lo que escribe la app', async () => {
  const appRepo = new GitDirRepo({ dir: join(root, 'app') });
  const dek = await C.unlockVault(await Vault.fetchVaultFile(appRepo), SECRET);
  const app = new Vault(appRepo, dek);
  await app.loadIndex();
  const idea = app.findByPath('Proyectos/Idea');
  assert.match(await app.read(idea.id), /otra tarea/);

  await app.saveNote(idea.id, (await app.read(idea.id)).replace('fin', 'fin (editado en la app)'));
  assert.match((await ops.readNote(s, { path: 'Idea' })).text, /editado en la app/);
});

test('cambios a la vez en la app y en el agente se juntan', async () => {
  const appRepo = new GitDirRepo({ dir: join(root, 'app') });
  const app = new Vault(appRepo, await C.unlockVault(await Vault.fetchVaultFile(appRepo), SECRET));
  await app.loadIndex();
  const idea = app.findByPath('Proyectos/Idea');
  const base = await app.read(idea.id);
  // El agente añade al final; la app cambia la primera línea sin saberlo.
  await ops.appendNote(s, { path: 'Idea', text: 'desde el agente' });
  const res = await app.saveNote(idea.id, base.replace('# Idea', '# Idea (app)'));
  assert.ok(res.merged, 'la app junta los dos cambios');
  const { text } = await ops.readNote(s, { path: 'Idea' });
  assert.match(text, /^# Idea \(app\)/);
  assert.match(text, /desde el agente\n$/);
});

test('push rechazado por un commit de otro dispositivo: 409 y reintento de Vault', async () => {
  const a = new GitDirRepo({ dir: agentDir });
  const b = new GitDirRepo({ dir: join(root, 'app') });
  await a.fetchHead();
  await b.fetchHead();
  await b.commit([{ path: 'x.txt', content: 'b' }], 'b');
  await assert.rejects(a.commit([{ path: 'x.txt', content: 'a' }], 'a'), (e) => e.status === 409);
  await b.commit([{ path: 'x.txt', delete: true }], 'limpiar');

  // Con la sesión: el índice que tiene en memoria se queda viejo y el push se rechaza; Vault recarga y repite.
  const appVault = new Vault(b, await C.unlockVault(await Vault.fetchVaultFile(b), SECRET));
  await appVault.loadIndex();
  const v = await s.open();
  await appVault.createNote('Desde la app', 'hola');
  await v.createNote('Desde el agente', 'adiós'); // parte de un head viejo
  const list = (await ops.listNotes(s)).notes.map((n) => n.path);
  assert.ok(list.includes('Desde la app') && list.includes('Desde el agente'));
});

test('en el repo no hay nada en claro', () => {
  const all = execFileSync('git', ['-C', remote, 'cat-file', '--batch-all-objects', '--batch'], { encoding: 'latin1' });
  for (const word of ['Bienvenido', 'Proyectos', 'Idea', 'agente', 'Diario', SECRET]) {
    assert.ok(!all.includes(word), `aparece «${word}» en claro`);
  }
  const msgs = sh(remote, 'log', '--format=%s', 'main');
  assert.ok(msgs.split('\n').filter(Boolean).every((m) => /^Snowlog: /.test(m) || ['b', 'limpiar'].includes(m)), msgs);
});

test('el clon local se pone al día si está limpio', () => {
  assert.equal(sh(agentDir, 'rev-parse', 'main').trim(), sh(remote, 'rev-parse', 'main').trim());
});

test('bloquear borra la clave; tras el tiempo sin uso se bloquea sola', async () => {
  const { session, asked } = newSession(agentDir, { answers: [SECRET, SECRET], lockAfterMs: 30 });
  await ops.unlock(session);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(session.unlocked, false);
  assert.equal(session.lockedReason, 'idle');
  await ops.listNotes(session);
  assert.equal(asked.length, 2);
  ops.lock(session);
  assert.equal(session.vault, null);
  assert.equal(session.parsed.size, 0);
});

test('servidor MCP: protocolo, herramientas y errores sin secretos', async () => {
  const out = [];
  const { session } = newSession(agentDir);
  const handle = createServer(session, (m) => out.push(m));
  await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
  await handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
  await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  await handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'read_note', arguments: { path: 'Idea' } } });
  await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'read_note', arguments: { path: 'Nada' } } });
  await handle({ jsonrpc: '2.0', id: 5, method: 'nope' });
  const byId = Object.fromEntries(out.map((m) => [m.id, m]));
  assert.equal(byId[1].result.serverInfo.name, 'snowlog');
  assert.ok(byId[2].result.tools.some((t) => t.name === 'backlinks'));
  assert.match(JSON.parse(byId[3].result.content[0].text).text, /desde el agente/);
  assert.equal(byId[4].result.isError, true);
  assert.equal(byId[5].error.code, -32601);
  assert.ok(!JSON.stringify(out).includes(SECRET));
  session.lock();
});

test('SNOWLOG_ASKPASS y el servidor como proceso', async () => {
  const askpass = join(root, 'askpass.sh');
  writeFileSync(askpass, `#!/bin/sh\nprintf '%s\\n' '${SECRET}'\n`);
  chmodSync(askpass, 0o700);
  process.env.SNOWLOG_ASKPASS = askpass;
  try {
    assert.equal(await askPassphrase('x'), SECRET);
  } finally {
    delete process.env.SNOWLOG_ASKPASS;
  }

  const p = spawn(process.execPath, [new URL('../agent/mcp.js', import.meta.url).pathname, '--dir', agentDir], {
    env: { ...process.env, SNOWLOG_ASKPASS: askpass },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  p.stdout.on('data', (d) => { stdout += d; });
  p.stderr.on('data', (d) => { stderr += d; });
  const send = (m) => p.stdin.write(`${JSON.stringify(m)}\n`);
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'backlinks', arguments: { path: 'Bienvenido' } } });
  for (let i = 0; i < 200 && !stdout.includes('"id":2'); i++) await new Promise((r) => setTimeout(r, 50));
  p.stdin.end();
  await new Promise((r) => p.on('close', r));
  const msgs = stdout.trim().split('\n').map((l) => JSON.parse(l));
  const res = JSON.parse(msgs.find((m) => m.id === 2).result.content[0].text);
  assert.deepEqual(res.backlinks.map((b) => b.path), ['Proyectos/Idea']);
  assert.ok(!stdout.includes(SECRET) && !stderr.includes(SECRET));
});
