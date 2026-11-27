// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// Every vault an earlier version of Snowlog made opens in this one with nothing lost, and can still be written to
// and recovered (docs/FORMAT.md). The fixtures are made by scripts/make-vault-fixtures.mjs with each version's code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFakeGitHub } from './fake-github.mjs';

const dir = new URL('./fixtures/vaults/', import.meta.url);
const fixtures = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

const fake = createFakeGitHub({ owner: 'o', repo: 'notes' });
globalThis.fetch = fake.fetch;
const { GitHubRepo } = await import('../public/js/github.js');
const { Vault } = await import('../public/js/vault.js');
const C = await import('../public/js/crypto.js');

test('there is a vault from every version that changed the vault code', () => {
  for (const v of ['2026-11-11-pr1', '2026-11-13-pr4', '2026-11-13-pr5', '2026-11-17-pr6', '2026-11-19-pr7', '2026-11-21-pr9', '2026-11-26-pr16']) {
    assert.ok(fixtures.includes(`${v}.json`), v);
  }
});

for (const name of fixtures) {
  test(`the vault made by ${name.replace('.json', '')} opens, reads, writes and recovers`, async () => {
    const fx = JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
    const f = createFakeGitHub({ owner: 'o', repo: 'notes' });
    f.seed(fx.files);
    globalThis.fetch = f.fetch;
    const repo = () => new GitHubRepo({ owner: 'o', repo: 'notes', branch: 'main' }, async () => 'token');

    // Opens with the passphrase, at the app's real PBKDF2 cost.
    const vaultFile = await Vault.fetchVaultFile(repo());
    const { dek } = await C.openVault(vaultFile, fx.passphrase);
    const vault = new Vault(repo(), dek);
    await vault.loadIndex();

    // Every note, with its path and text.
    const notes = [];
    for (const n of vault.notes()) notes.push({ path: n.path, text: await vault.read(n.id) });
    assert.deepEqual(notes.sort((a, b) => a.path.localeCompare(b.path)), fx.expect.notes);

    // Every attachment, byte for byte.
    const files = new Map(vault.files().map((x) => [x.path, x.id]));
    for (const [path, hash] of fx.expect.attachments) {
      assert.ok(files.has(path), path);
      assert.equal(sha(await vault.readFile(files.get(path))), hash, path);
    }
    if (fx.expect.library != null) assert.equal(await vault.readLibrary(), fx.expect.library);

    // Writing to it still works, and another device reads what was written.
    const id = await vault.createNote('Written by this version', 'still works');
    const other = new Vault(repo(), dek);
    await other.loadIndex();
    assert.equal(await other.read(id), 'still works');

    // The recovery code still sets a new passphrase, which then opens it.
    const { vault: recovered } = await C.recoverVault(await Vault.fetchVaultFile(repo()), fx.recoveryCode, 'a brand new passphrase');
    assert.ok((await C.openVault(recovered, 'a brand new passphrase')).dek);
    globalThis.fetch = fake.fetch;
  });
}

// What the format holds today. Changing this means changing docs/FORMAT.md, and only by adding optional fields.
test('docs/FORMAT.md documents every field of vault.json and of the index', async () => {
  const fx = JSON.parse(readFileSync(new URL(fixtures.at(-1), dir), 'utf8'));
  const vaultFile = JSON.parse(fx.files['.snowlog/vault.json']);
  const { dek } = await C.openVault(vaultFile, fx.passphrase);
  const index = JSON.parse(await C.decryptText(dek, fx.files['.snowlog/index.enc'], 'index'));
  const keys = new Set([
    ...Object.keys(vaultFile), ...Object.keys(vaultFile.keys), ...Object.keys(vaultFile.keys.passphrase),
    ...Object.keys(vaultFile.keys.passphrase.kdf), ...Object.keys(index),
    ...Object.values(index.notes).flatMap(Object.keys), ...Object.values(index.files).flatMap(Object.keys),
  ]);
  const doc = readFileSync(new URL('../docs/FORMAT.md', import.meta.url), 'utf8');
  for (const k of keys) assert.ok(doc.includes(`"${k}"`) || doc.includes(`\`${k}\``), `docs/FORMAT.md documents ${k}`);
});
