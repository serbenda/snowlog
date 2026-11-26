#!/usr/bin/env node
// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// Writes tests/fixtures/vaults/<name>.json: a vault (the notes repository's files) made by the code of an earlier
// version of Snowlog, from a temporary git worktree of its commit, with what it holds in plaintext so the tests can
// check that the current version opens it with nothing lost (tests/vault-compat.test.mjs).
// Each version gets the same story, as far as it can: notes in folders, an edit, a rename, a deletion, attachments
// (a picture and a drawing), the drawing library, a key rotation and a note written after it.
// Run it once per release that changes the vault code: node scripts/make-vault-fixtures.mjs [name…]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(new URL('..', import.meta.url).pathname);
// The merges into main that changed the vault code (crypto, vault, github, index).
const VERSIONS = [
  ['2026-11-11-pr1', 'fb63a22'],
  ['2026-11-13-pr4', 'c0b497c'],
  ['2026-11-13-pr5', 'c07ead3'],
  ['2026-11-17-pr6', '4be948f'],
  ['2026-11-19-pr7', '085dc07'],
  ['2026-11-21-pr9', '2c0ba02'],
  ['2026-11-26-pr16', 'cb22268'],
];
const only = process.argv.slice(2);
const PASS = 'compatibility test passphrase';
const ITERATIONS = 600000; // the app's own: the fixtures are opened as real vaults are
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
// A 1×1 PNG and a small drawing.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const SKETCH = Buffer.from(JSON.stringify({ type: 'sketch', version: 1, background: '#ffffff', elements: [{ id: 'r', type: 'rectangle', x: 0, y: 0, w: 100, h: 60, seed: 1 }] }));
const { createFakeGitHub } = await import(pathToFileURL(join(root, 'tests/fake-github.mjs')).href);

const outDir = join(root, 'tests/fixtures/vaults');
mkdirSync(outDir, { recursive: true });
for (const [name, rev] of VERSIONS) {
  if (only.length && !only.includes(name)) continue;
  const dir = mkdtempSync(join(tmpdir(), 'snowlog-fixture-'));
  try {
    execFileSync('git', ['-C', root, 'worktree', 'add', '--detach', '--quiet', dir, rev]);
    const fake = createFakeGitHub({ owner: 'o', repo: 'notes' });
    globalThis.fetch = fake.fetch;
    const mod = (f) => import(`${pathToFileURL(join(dir, 'public/js', f)).href}?v=${rev}`);
    const { GitHubRepo } = await mod('github.js');
    const { Vault } = await mod('vault.js');
    const repo = () => new GitHubRepo({ owner: 'o', repo: 'notes', branch: 'main' }, async () => 'token');
    let { vault, recoveryCode } = await Vault.create(repo(), PASS, ITERATIONS);
    const done = [];
    const plan = await vault.createNote('Projects/Plan', 'first draft');
    await vault.saveNote(plan, '# Plan\n\nÑandú, café, 😀 — and a [[Diary/Monday]] link.\n\n- [ ] a task #idea\n');
    const day = await vault.createNote('Diary/2026-11-01', 'it rained');
    await vault.renameNote(day, 'Diary/Monday');
    const gone = await vault.createNote('Trash me', 'temporary');
    await vault.deleteNote(gone);
    done.push('notes');
    const files = [];
    if (vault.addFile) {
      await vault.addFile('Projects', 'picture.png', new Uint8Array(PNG));
      files.push(['Projects/picture.png', sha(PNG)]);
      try {
        await vault.addFile('Projects', 'board.sketch', new Uint8Array(SKETCH));
        files.push(['Projects/board.sketch', sha(SKETCH)]);
      } catch { /* drawings came later */ }
      done.push('attachments');
    }
    let library = null;
    if (vault.saveLibrary) {
      library = JSON.stringify({ type: 'bsketchlib', version: 1, items: [] });
      await vault.saveLibrary(library);
      done.push('library');
    }
    if (vault.rotate) {
      const C = await mod('crypto.js');
      void C;
      const vaultFile = await Vault.fetchVaultFile(repo());
      const res = await vault.rotate(vaultFile, PASS, ITERATIONS);
      recoveryCode = res.recoveryCode;
      await vault.createNote('After rotation', 'written with the new key');
      done.push('rotation');
    }
    const notes = [];
    for (const n of vault.notes()) notes.push({ path: n.path, text: await vault.read(n.id) });
    const fixture = {
      made_by: { name, commit: rev },
      steps: done,
      passphrase: PASS,
      recoveryCode,
      files: Object.fromEntries([...fake.files()].sort(([a], [b]) => a.localeCompare(b))),
      expect: { notes: notes.sort((a, b) => a.path.localeCompare(b.path)), attachments: files, library },
    };
    writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(fixture, null, 1)}\n`);
    console.log(`${name} (${rev}): ${notes.length} notes, ${files.length} attachments, ${done.join(', ')}`);
  } finally {
    execFileSync('git', ['-C', root, 'worktree', 'remove', '--force', dir]);
    rmSync(dir, { recursive: true, force: true });
  }
}
