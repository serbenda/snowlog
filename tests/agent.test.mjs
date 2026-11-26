// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// Agent and script access to the vault (agent/): local git repository, session, operations and MCP server.
// Everything runs against a test vault in a temporary folder: a bare remote and clones that act as
// devices.

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
const SECRET = 'very secret test passphrase';
let root;
let remote;

const sh = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function newClone(name) {
  const dir = join(root, name);
  execFileSync('git', ['init', '-q', '-b', 'main', dir]);
  sh(dir, 'config', 'user.name', 'Test');
  sh(dir, 'config', 'user.email', 'test@example.com');
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
  // The vault is created with the same function the app uses, from another "device".
  const app = newClone('app');
  await Vault.create(new GitDirRepo({ dir: app }), SECRET, ITER);
  agentDir = newClone('agent');
  ({ session: s } = newSession(agentDir));
});

after(() => {
  s?.lock();
  if (root) rmSync(root, { recursive: true, force: true });
});

test('status while locked: does not ask for the passphrase', async () => {
  const { session, asked } = newSession(agentDir);
  assert.deepEqual(await ops.status(session), { unlocked: false, reason: null });
  assert.equal(asked.length, 0);
});

test('unlock: wrong passphrase, retry and cancel', async () => {
  const ok = newSession(agentDir, { answers: ['wrong', SECRET] });
  const st = await ops.unlock(ok.session);
  assert.equal(st.unlocked, true);
  assert.equal(ok.asked.length, 2);
  assert.match(ok.asked[1], /Wrong passphrase/);

  const bad = newSession(agentDir, { answers: ['a', 'b', 'c'] });
  await assert.rejects(ops.unlock(bad.session), (e) => e.code === 'bad_secret' && !e.message.includes('a'.repeat(2)));

  const cancel = newSession(agentDir, { answers: [] });
  await assert.rejects(ops.listNotes(cancel.session), (e) => e.code === 'cancelled');
});

test('list and read the welcome note the app creates', async () => {
  const list = await ops.listNotes(s);
  assert.deepEqual(list.notes.map((n) => n.path), ['Welcome']);
  const n = await ops.readNote(s, { path: '[[Welcome]]' });
  assert.match(n.text, /end-to-end encrypted/);
  await assert.rejects(ops.readNote(s, { path: 'Does not exist' }), (e) => e.code === 'not_found');
});

test('create notes, follow links and backlinks', async () => {
  await ops.createNote(s, { path: 'Projects/Idea', text: '# Idea\nSee [[Welcome]] and [[Nothing]].\n\n## Tasks\n- [ ] try #agent\n\n## Notes\nend\n' });
  await ops.createNote(s, { path: 'Projects/Other.md', text: 'Related to [[Projects/Idea|the idea]]' });
  await assert.rejects(ops.createNote(s, { path: 'Projects/Idea' }), (e) => e.code === 'exists');
  await assert.rejects(ops.createNote(s, { path: 'Bad: name' }), (e) => e.code === 'bad_chars');

  const out = await ops.links(s, { path: 'Idea' });
  assert.deepEqual(out.links.map((l) => [l.target, l.path]), [['Welcome', 'Welcome'], ['Nothing', null]]);
  assert.equal(out.unresolved, 1);

  const back = await ops.backlinks(s, { path: 'Idea' });
  assert.deepEqual(back.backlinks.map((b) => b.path), ['Projects/Other']);
  assert.equal(back.backlinks[0].lines[0].line, 1);
  const welcome = await ops.backlinks(s, { path: 'Welcome' });
  assert.deepEqual(welcome.backlinks.map((b) => b.path), ['Projects/Idea']);

  const list = await ops.listNotes(s, { folder: 'Projects', recursive: false });
  assert.deepEqual(list.notes.map((n) => n.path), ['Projects/Idea', 'Projects/Other']);
});

test('search ignoring case and by tag; list tags', async () => {
  const r = await ops.search(s, { query: 'TRY tag:#agent' });
  assert.equal(r.total, 1);
  assert.equal(r.results[0].path, 'Projects/Idea');
  assert.equal(r.results[0].matches[0].line, 5);
  assert.equal((await ops.search(s, { query: 'encrypted' })).results[0].path, 'Welcome');
  assert.deepEqual((await ops.listTags(s)).tags.find((t) => t.tag === 'agent'), { tag: 'agent', count: 1 });
});

test('append at the end or inside a section', async () => {
  await ops.appendNote(s, { path: 'Idea', text: '- [ ] another task', heading: 'Tasks' });
  await ops.appendNote(s, { path: 'Idea', text: 'Last line ñ' });
  const { text } = await ops.readNote(s, { path: 'Idea' });
  assert.equal(text, '# Idea\nSee [[Welcome]] and [[Nothing]].\n\n## Tasks\n- [ ] try #agent\n- [ ] another task\n\n## Notes\nend\nLast line ñ\n');
  await assert.rejects(ops.appendNote(s, { path: 'Idea', text: 'x', heading: 'Missing' }), (e) => e.code === 'heading_not_found');
});

test('appendText respects subsections and code blocks', () => {
  const doc = '## A\none\n### A1\ntwo\n\n```\n## A\n```\n## B\nthree';
  assert.equal(ops.appendText(doc, 'new', 'A'), '## A\none\n### A1\ntwo\n\n```\n## A\n```\nnew\n\n## B\nthree\n');
  assert.equal(ops.appendText('', 'hello'), 'hello\n');
});

test('daily note from the daily template', async () => {
  const d = await ops.dailyNote(s, { date: '2026-11-13' });
  assert.equal(d.path, 'Daily/2026-11-13');
  assert.equal(d.created, true);
  assert.match(d.text, /date: 2026-11-13/);
  assert.match(d.text, /# Friday, November 13, 2026/);
  const again = await ops.dailyNote(s, { date: '2026-11-13' });
  assert.equal(again.created, false);
  assert.deepEqual(await ops.dailyNote(s, { date: '2026-11-14', create: false }), { path: 'Daily/2026-11-14', created: false, exists: false });
  await assert.rejects(ops.dailyNote(s, { date: 'tomorrow' }), (e) => e.code === 'bad_date');
});

test('the app reads what the agent writes and the agent sees what the app writes', async () => {
  const appRepo = new GitDirRepo({ dir: join(root, 'app') });
  const dek = await C.unlockVault(await Vault.fetchVaultFile(appRepo), SECRET);
  const app = new Vault(appRepo, dek);
  await app.loadIndex();
  const idea = app.findByPath('Projects/Idea');
  assert.match(await app.read(idea.id), /another task/);

  await app.saveNote(idea.id, (await app.read(idea.id)).replace('end', 'end (edited in the app)'));
  assert.match((await ops.readNote(s, { path: 'Idea' })).text, /edited in the app/);
});

test('simultaneous changes in the app and the agent are combined', async () => {
  const appRepo = new GitDirRepo({ dir: join(root, 'app') });
  const app = new Vault(appRepo, await C.unlockVault(await Vault.fetchVaultFile(appRepo), SECRET));
  await app.loadIndex();
  const idea = app.findByPath('Projects/Idea');
  const base = await app.read(idea.id);
  // The agent appends at the end; the app changes the first line without knowing.
  await ops.appendNote(s, { path: 'Idea', text: 'from the agent' });
  const res = await app.saveNote(idea.id, base.replace('# Idea', '# Idea (app)'));
  assert.ok(res.merged, 'the app combines both changes');
  const { text } = await ops.readNote(s, { path: 'Idea' });
  assert.match(text, /^# Idea \(app\)/);
  assert.match(text, /from the agent\n$/);
});

test('push rejected by another device\'s commit: 409 and Vault retries', async () => {
  const a = new GitDirRepo({ dir: agentDir });
  const b = new GitDirRepo({ dir: join(root, 'app') });
  await a.fetchHead();
  await b.fetchHead();
  await b.commit([{ path: 'x.txt', content: 'b' }], 'b');
  await assert.rejects(a.commit([{ path: 'x.txt', content: 'a' }], 'a'), (e) => e.status === 409);
  await b.commit([{ path: 'x.txt', delete: true }], 'clean up');

  // With the session: its in-memory index goes stale and the push is rejected; Vault reloads and repeats.
  const appVault = new Vault(b, await C.unlockVault(await Vault.fetchVaultFile(b), SECRET));
  await appVault.loadIndex();
  const v = await s.open();
  await appVault.createNote('From the app', 'hello');
  await v.createNote('From the agent', 'bye'); // starts from an old head
  const list = (await ops.listNotes(s)).notes.map((n) => n.path);
  assert.ok(list.includes('From the app') && list.includes('From the agent'));
});

test('nothing in the repository is in plaintext', () => {
  const all = execFileSync('git', ['-C', remote, 'cat-file', '--batch-all-objects', '--batch'], { encoding: 'latin1' });
  for (const word of ['Welcome', 'Projects', 'Idea', '#agent', 'Daily', SECRET]) {
    assert.ok(!all.includes(word), `"${word}" appears in plaintext`);
  }
  const msgs = sh(remote, 'log', '--format=%s', 'main');
  assert.ok(msgs.split('\n').filter(Boolean).every((m) => /^Snowlog: /.test(m) || ['b', 'clean up'].includes(m)), msgs);
});

test('the local clone catches up if it is clean', () => {
  assert.equal(sh(agentDir, 'rev-parse', 'main').trim(), sh(remote, 'rev-parse', 'main').trim());
});

test('locking wipes the key; it locks itself after the idle time', async () => {
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

test('MCP server: protocol, tools and errors without secrets', async () => {
  const out = [];
  const { session } = newSession(agentDir);
  const handle = createServer(session, (m) => out.push(m));
  await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
  await handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
  await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  await handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'read_note', arguments: { path: 'Idea' } } });
  await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'read_note', arguments: { path: 'Nothing' } } });
  await handle({ jsonrpc: '2.0', id: 5, method: 'nope' });
  const byId = Object.fromEntries(out.map((m) => [m.id, m]));
  assert.equal(byId[1].result.serverInfo.name, 'snowlog');
  assert.ok(byId[2].result.tools.some((t) => t.name === 'backlinks'));
  assert.match(JSON.parse(byId[3].result.content[0].text).text, /from the agent/);
  assert.equal(byId[4].result.isError, true);
  assert.equal(byId[5].error.code, -32601);
  assert.ok(!JSON.stringify(out).includes(SECRET));
  session.lock();
});

test('SNOWLOG_ASKPASS and the server as a process', async () => {
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
  send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'backlinks', arguments: { path: 'Welcome' } } });
  for (let i = 0; i < 200 && !stdout.includes('"id":2'); i++) await new Promise((r) => setTimeout(r, 50));
  p.stdin.end();
  await new Promise((r) => p.on('close', r));
  const msgs = stdout.trim().split('\n').map((l) => JSON.parse(l));
  const res = JSON.parse(msgs.find((m) => m.id === 2).result.content[0].text);
  assert.deepEqual(res.backlinks.map((b) => b.path), ['Projects/Idea']);
  assert.ok(!stdout.includes(SECRET) && !stderr.includes(SECRET));
});
