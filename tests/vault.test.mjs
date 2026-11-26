// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGitHub } from './fake-github.mjs';
import { KDF_LIMITS as KDF } from '../public/js/crypto.js';

const ITER = 1000;
// Below the app's floor of 600,000 only so the tests are fast.
KDF.min = 1000;
const fake = createFakeGitHub({ owner: 'serbenda', repo: 'snowlog-notes' });
globalThis.fetch = fake.fetch;

const { GitHubRepo } = await import('../public/js/github.js');
const { Vault, VAULT_FILE, INDEX_FILE } = await import('../public/js/vault.js');
const C = await import('../public/js/crypto.js');

const repoCfg = { owner: 'serbenda', repo: 'snowlog-notes', branch: 'main' };
const newRepo = () => new GitHubRepo(repoCfg, async () => 'token');

let vault;
let recovery;

test('create the vault in an empty repository', async () => {
  const r = await Vault.create(newRepo(), 'test passphrase', ITER);
  vault = r.vault;
  recovery = r.recoveryCode;
  const files = fake.files();
  assert.ok(files.has(VAULT_FILE));
  assert.ok(files.has(INDEX_FILE));
  assert.equal(vault.notes().length, 1);
  assert.equal(vault.notes()[0].path, 'Welcome');
  await assert.rejects(Vault.create(newRepo(), 'another test passphrase', ITER), /vault_exists/);
});

test('create, save and read notes from another device', async () => {
  const id = await vault.createNote('Work/Ideas/Secret plan', 'initial text');
  await vault.saveNote(id, '# Plan\nVery secret content');
  assert.deepEqual(vault.index.folders.sort(), ['Work', 'Work/Ideas']);

  const vaultFile = await Vault.fetchVaultFile(newRepo());
  const dek = await C.unlockVault(vaultFile, 'test passphrase');
  const other = new Vault(newRepo(), dek);
  await other.loadIndex();
  const hit = other.findByTitle('secret plan');
  assert.equal(hit.id, id);
  assert.equal(await other.read(id), '# Plan\nVery secret content');
});

test('the repository holds no titles or content in plaintext', () => {
  for (const [path, content] of fake.files()) {
    for (const secret of ['Secret plan', 'Work', 'Very secret', 'Welcome']) {
      assert.ok(!path.includes(secret), `path ${path}`);
      assert.ok(!content.includes(secret), `content of ${path}`);
    }
  }
});

test('repeated names and odd characters are not allowed', async () => {
  await assert.rejects(vault.createNote('work/ideas/SECRET plan'), /exists/);
  await assert.rejects(vault.createNote('a:b'), /bad_chars/);
  await assert.rejects(vault.createNote('  /  '), /empty_name/);
  assert.equal(vault.freePath('Work', 'Untitled'), 'Work/Untitled');
});

test('renaming and moving folders carries their notes', async () => {
  const id = vault.findByTitle('Secret plan').id;
  await vault.renameFolder('Work', 'Office');
  assert.equal(vault.index.notes[id].path, 'Office/Ideas/Secret plan');
  assert.ok(!vault.index.folders.some((f) => f.startsWith('Work')));
  await assert.rejects(vault.renameFolder('Office', 'Office/Ideas/Inside'), /into_itself/);
  await vault.renameNote(id, 'Secret plan');
  assert.equal(vault.index.notes[id].path, 'Secret plan');
});

test('if another device writes at the same time, it retries without losing anything', async () => {
  const other = new Vault(newRepo(), vault.dek);
  await other.loadIndex();
  const idOther = await other.createNote('From the phone', 'hello');
  // `vault` still has an old head: the commit clashes and must retry on the new index.
  const idMine = await vault.createNote('From the laptop', 'bye');
  const check = new Vault(newRepo(), vault.dek);
  await check.loadIndex();
  assert.ok(check.index.notes[idOther]);
  assert.ok(check.index.notes[idMine]);
});

test('deleting a note and a folder deletes their files', async () => {
  const id = await vault.createNote('Temporary/Delete', 'x');
  const before = fake.files().size;
  await vault.deleteFolder('Temporary');
  assert.equal(fake.files().size, before - 1);
  assert.equal(vault.index.notes[id], undefined);
  assert.ok(!vault.index.folders.includes('Temporary'));
  const id2 = vault.findByTitle('From the phone').id;
  await vault.deleteNote(id2);
  assert.ok(![...fake.files().keys()].some((p) => p.includes(id2)));
});

test('recovering with the code changes the passphrase in the repository', async () => {
  const vaultFile = await Vault.fetchVaultFile(newRepo());
  const { vault: updated } = await C.recoverVault(vaultFile, recovery, 'new test passphrase');
  await vault.writeVaultFile(updated);
  const again = await Vault.fetchVaultFile(newRepo());
  const dek = await C.unlockVault(again, 'new test passphrase');
  const v = new Vault(newRepo(), dek);
  await v.loadIndex();
  assert.ok(v.findByTitle('Secret plan'));
});

test('import notes in batches, without plaintext and resolving repeated names', async () => {
  const commitsBefore = fake.commitCount();
  const items = [
    { path: 'Personal/Ideas/Trip to Japón', text: '# Japón\nSee [[Shopping list]] #trip' },
    { path: 'Personal/Shopping list', text: '- [ ] milk' },
    { path: 'Secret plan', text: 'another version' },
    ...Array.from({ length: 5 }, (_, i) => ({ path: `Daily/2026-11-0${i + 1}`, text: `day ${i + 1}` })),
  ];
  const progress = [];
  const result = await vault.importNotes(items, { batchSize: 3, onProgress: (d, t) => progress.push(`${d}/${t}`) });
  assert.equal(result.length, 8);
  assert.deepEqual(progress, ['3/8', '6/8', '8/8']);
  assert.equal(fake.commitCount() - commitsBefore, 3);
  assert.equal(result[2].path, 'Secret plan (imported)');
  assert.ok(vault.index.folders.includes('Personal/Ideas'));

  const fresh = new Vault(newRepo(), vault.dek);
  await fresh.loadIndex();
  const japan = fresh.findByTitle('Trip to Japón');
  assert.equal(await fresh.read(japan.id), '# Japón\nSee [[Shopping list]] #trip');
  for (const [path, content] of fake.files()) {
    assert.ok(!path.includes('Japón') && !content.includes('Japón') && !content.includes('milk'), path);
  }
});

test('importNotes can create empty folders and use another message', async () => {
  await vault.importNotes([{ path: 'Home', text: '# Home' }], { message: 'set up my space', folders: ['Archive', 'Projects'] });
  assert.ok(vault.index.folders.includes('Archive'));
  assert.ok(vault.findByPath('Home'));
});

test('saveMany saves several notes in a single commit', async () => {
  const a = await vault.createNote('Batch/A', 'a');
  const b = await vault.createNote('Batch/B', 'b');
  const before = fake.commitCount();
  await vault.saveMany([{ id: a, text: 'a2' }, { id: b, text: 'b2' }]);
  assert.equal(fake.commitCount() - before, 1);
  const fresh = new Vault(newRepo(), vault.dek);
  await fresh.loadIndex();
  assert.equal(await fresh.read(a), 'a2');
  assert.equal(await fresh.read(b), 'b2');
});

test('attachments: encrypted, read from another device and moved with their folder', async () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const a = await vault.addFile('Trip photos', 'secret beach.png', png);
  assert.equal(a.path, 'Trip photos/secret beach.png');
  const b = await vault.addFile('Trip photos', 'secret beach.png', png);
  assert.equal(b.path, 'Trip photos/secret beach 1.png');
  await assert.rejects(vault.addFile('', 'virus.exe', png), /bad_type/);
  await assert.rejects(vault.addFile('', 'huge.pdf', new Uint8Array(21 * 1024 * 1024)), /too_big/);
  for (const [path, content] of fake.files()) {
    assert.ok(!path.includes('beach') && !content.includes('beach') && !content.includes('photos'), path);
  }
  const other = new Vault(newRepo(), vault.dek);
  await other.loadIndex();
  assert.equal(other.findFile('SECRET BEACH.png').id, a.id);
  assert.deepEqual(await other.readFile(a.id), png);
  await vault.renameFolder('Trip photos', 'Archive/Photos');
  assert.equal(vault.findFile('secret beach.png').path, 'Archive/Photos/secret beach.png');
  await vault.deleteFile(b.id);
  assert.ok(![...fake.files().keys()].some((p) => p.includes(b.id)));
  await vault.deleteFolder('Archive');
  assert.equal(vault.files().length, 0);
  assert.ok(![...fake.files().keys()].some((p) => p.includes(a.id)));
});

test('if the same note changes on two devices, both versions are kept', async () => {
  const id = await vault.createNote('Shared', 'initial version');
  const phone = new Vault(newRepo(), vault.dek);
  await phone.loadIndex();
  assert.equal(await phone.read(id), 'initial version');
  // The laptop saves first; the phone, which does not know, saves afterwards.
  assert.deepEqual(await vault.saveNote(id, 'from the laptop'), {});
  const res = await phone.saveNote(id, 'from the phone');
  assert.ok(res.conflict, 'it must detect the conflict');
  assert.match(res.conflict.path, /^Shared \(other device \d{4}-\d\d-\d\d \d{4}\)$/);
  const check = new Vault(newRepo(), vault.dek);
  await check.loadIndex();
  assert.equal(await check.read(id), 'from the phone');
  assert.equal(await check.read(res.conflict.id), 'from the laptop');
  // Now in sync: saving again creates no more copies.
  assert.deepEqual(await phone.saveNote(id, 'once more'), {});
  // And the laptop, saving with its old version, also keeps the phone's.
  const res2 = await vault.saveNote(id, 'laptop again');
  assert.ok(res2.conflict);
  const check2 = new Vault(newRepo(), vault.dek);
  await check2.loadIndex();
  assert.equal(await check2.read(res2.conflict.id), 'once more');
});

test('if another device deleted the note, saving it restores it', async () => {
  const id = await vault.createNote('Deleted elsewhere', 'text');
  const other = new Vault(newRepo(), vault.dek);
  await other.loadIndex();
  await other.deleteNote(id);
  await vault.saveNote(id, 'text that is not lost');
  const check = new Vault(newRepo(), vault.dek);
  await check.loadIndex();
  assert.equal(check.findByTitle('Deleted elsewhere').id, id);
  assert.equal(await check.read(id), 'text that is not lost');
});

test('changes to different notes are not a conflict', async () => {
  const a = await vault.createNote('Note A', 'a');
  const b = await vault.createNote('Note B', 'b');
  const other = new Vault(newRepo(), vault.dek);
  await other.loadIndex();
  await other.read(b);
  await vault.saveNote(a, 'a2');
  assert.deepEqual(await other.saveNote(b, 'b2'), {});
  assert.equal(other.notes().filter((n) => n.path.includes('other device')).length, 2, 'only the copies from the previous test');
});

test('history: lists a note\'s versions, decrypts them and allows restoring', async () => {
  const id = await vault.createNote('With history', 'v1');
  await vault.saveNote(id, 'v2');
  await vault.createNote('Any other note', 'x');
  await vault.saveNote(id, 'v3');
  const versions = await vault.history(id);
  assert.equal(versions.length, 3);
  assert.ok(versions[0].date > versions[2].date);
  assert.deepEqual(await Promise.all(versions.map((v) => vault.readVersion(id, v.ref))), ['v3', 'v2', 'v1']);
  await vault.saveNote(id, await vault.readVersion(id, versions[2].ref));
  const fresh = new Vault(newRepo(), vault.dek);
  await fresh.loadIndex();
  assert.equal(await fresh.read(id), 'v1');
  assert.equal((await fresh.history(id)).length, 4, 'restoring does not delete the history');
});

test('encrypted local cache: does not download again what did not change, and stays up to date', async () => {
  const { memoryCache } = await import('../public/js/cache.js');
  const store = memoryCache();
  const a = await vault.createNote('Cache/A', 'a1');
  const b = await vault.createNote('Cache/B', 'b1');
  let gets = 0;
  const counting = async (url, opts) => {
    if ((opts?.method || 'GET') === 'GET' && url.includes('/contents/n/')) gets += 1;
    return fake.fetch(url, opts);
  };
  globalThis.fetch = counting;
  try {
    const first = new Vault(newRepo(), vault.dek, { store });
    await first.loadIndex();
    await first.read(a);
    await first.read(b);
    assert.equal(gets, 2);
    for (const [, v] of store.map) assert.match(v.content, /^[A-Za-z0-9+/=\s]+$/, 'the cache only stores ciphertext (base64)');
    gets = 0;
    const second = new Vault(newRepo(), vault.dek, { store });
    await second.loadIndex();
    assert.equal(await second.read(a), 'a1');
    assert.equal(await second.read(b), 'b1');
    assert.equal(gets, 0, 'everything comes from the cache');
    await vault.saveNote(a, 'a2'); // changes on another device
    const third = new Vault(newRepo(), vault.dek, { store });
    await third.loadIndex();
    gets = 0;
    assert.equal(await third.read(a), 'a2');
    assert.equal(await third.read(b), 'b1');
    assert.equal(gets, 1, 'only the changed one is downloaded');
    await third.saveNote(b, 'b2'); // what is saved here goes into the cache
    const fourth = new Vault(newRepo(), vault.dek, { store });
    await fourth.loadIndex();
    gets = 0;
    assert.equal(await fourth.read(b), 'b2');
    assert.equal(gets, 0);
    // A tampered entry does not decrypt and is fetched from the repository again.
    const key = [...store.map.keys()].find((k) => k.includes(a));
    store.map.set(key, { ...store.map.get(key), content: store.map.get(key).content.slice(0, -6) + 'AAAAA=' });
    const fifth = new Vault(newRepo(), vault.dek, { store });
    await fifth.loadIndex();
    assert.equal(await fifth.read(a), 'a2');
  } finally {
    globalThis.fetch = fake.fetch;
  }
});

test('offline: writing goes on and everything is uploaded when the network is back, with conflicts if any', async () => {
  const { memoryCache } = await import('../public/js/cache.js');
  const store = memoryCache();
  const shared = await vault.createNote('Offline/Shared', 'base');
  const alone = await vault.createNote('Offline/Only here', 'base');
  const laptop = new Vault(newRepo(), vault.dek, { store });
  await laptop.loadIndex();
  await laptop.read(shared);
  await laptop.read(alone);

  const noNetwork = async () => { throw new TypeError('Failed to fetch'); };
  globalThis.fetch = noNetwork;
  try {
    assert.deepEqual(await laptop.saveNote(alone, 'written on the plane'), { queued: true });
    assert.ok(laptop.offline);
    assert.deepEqual(await laptop.saveNote(shared, 'my version from the plane'), { queued: true });
    const fresh = await laptop.createNote('Offline/Untitled', 'idea');
    await laptop.renameNote(fresh, 'Offline/Idea from the plane'); // a new note not uploaded yet: renamed here
    await assert.rejects(laptop.renameNote(alone, 'Another name'), /offline/);
    for (const [, v] of store.map) assert.ok(!JSON.stringify(v).includes('plane'), 'what is pending is encrypted');

    // Reloading the app offline: it opens with the index and the pending changes stored in the cache.
    const reloaded = new Vault(newRepo(), vault.dek, { store });
    await reloaded.loadIndex();
    assert.ok(reloaded.offline);
    assert.equal(reloaded.outbox.size, 3);
    assert.equal(await reloaded.read(alone), 'written on the plane');
    assert.equal(reloaded.findByTitle('Idea from the plane').id, fresh);
    await assert.rejects(reloaded.sync(), /offline/);
  } finally {
    globalThis.fetch = fake.fetch;
  }
  // Meanwhile, another device changed the shared note.
  await vault.saveNote(shared, 'the phone\'s version');

  const again = new Vault(newRepo(), vault.dek, { store });
  await again.loadIndex();
  const res = await again.sync();
  assert.equal(res.synced, 3);
  assert.equal(res.conflicts.length, 1);
  assert.equal(again.outbox.size, 0);
  assert.equal(await store.get('outbox'), undefined);
  const check = new Vault(newRepo(), vault.dek);
  await check.loadIndex();
  assert.equal(await check.read(alone), 'written on the plane');
  assert.equal(await check.read(shared), 'my version from the plane');
  assert.equal(await check.read(res.conflicts[0].id), 'the phone\'s version');
  assert.equal(await check.read(check.findByTitle('Idea from the plane').id), 'idea');
});

test('settings are stored encrypted in the index and seen from another device', async () => {
  await vault.saveSettings({ dailyFolder: 'Secret journal', lockAfterMinutes: 5 });
  for (const [, content] of fake.files()) assert.ok(!content.includes('journal'));
  const other = new Vault(newRepo(), vault.dek);
  await other.loadIndex();
  assert.deepEqual(other.getSettings(), { dailyFolder: 'Secret journal', lockAfterMinutes: 5 });
});

test('prefetch: downloads many notes in few requests and leaves the cache ready', async () => {
  const { memoryCache } = await import('../public/js/cache.js');
  const items = Array.from({ length: 230 }, (_, i) => ({ path: `Big batch/N${i}`, text: `text ${i}` }));
  const created = await vault.importNotes(items, { batchSize: 300 });
  const store = memoryCache();
  const fresh = new Vault(newRepo(), vault.dek, { store });
  await fresh.loadIndex();
  let rest = 0;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('/contents/n/')) rest += 1;
    return fake.fetch(url, opts);
  };
  try {
    const before = fake.graphqlCalls();
    const n = await fresh.prefetch(created.map((c) => c.id));
    assert.equal(n, 230);
    assert.equal(fake.graphqlCalls() - before, 3, '230 notes = 3 requests');
    assert.equal(await fresh.read(created[229].id), 'text 229');
    assert.equal(rest, 0, 'no need to fetch them one by one any more');
    assert.equal(await fresh.prefetch(created.map((c) => c.id)), 0, 'what is already there is not fetched again');
    // If GraphQL fails, no harm done: they are read one by one.
    const other = new Vault(newRepo(), vault.dek);
    await other.loadIndex();
    globalThis.fetch = async (url, opts) => (url.endsWith('/graphql') ? new Response('{}', { status: 502 }) : fake.fetch(url, opts));
    assert.equal(await other.prefetch([created[0].id]), 0);
    assert.equal(await other.read(created[0].id), 'text 0');
  } finally {
    globalThis.fetch = fake.fetch;
  }
});

test('if two devices change different parts of a note, they are combined without a copy', async () => {
  const id = await vault.createNote('Merge/List', '# Shopping\n- milk\n- bread\n\n## Notes\nnothing');
  const phone = new Vault(newRepo(), vault.dek);
  await phone.loadIndex();
  await phone.read(id);
  await vault.saveNote(id, '# Shopping\n- lactose-free milk\n- bread\n\n## Notes\nnothing');
  const res = await phone.saveNote(id, '# Shopping\n- milk\n- bread\n\n## Notes\ncall the plumber');
  assert.equal(res.conflict, undefined);
  assert.equal(res.merged, '# Shopping\n- lactose-free milk\n- bread\n\n## Notes\ncall the plumber');
  const check = new Vault(newRepo(), vault.dek);
  await check.loadIndex();
  assert.equal(await check.read(id), res.merged);
  assert.equal(check.notes().filter((n) => n.path.startsWith('Merge/')).length, 1, 'no copies');
});

test('rotating the key: everything is re-encrypted, the history is still readable and the old key no longer works', async () => {
  const id = await vault.createNote('Rotate/Secret', 'version 1');
  await vault.saveNote(id, 'version 2');
  const att = await vault.addFile('Rotate', 'photo.png', new Uint8Array([1, 2, 3, 4]));
  await vault.saveLibrary('{"type":"bsketchlib","items":[{"name":"rotating piece"}]}');
  const before = new Map(fake.files());
  const oldDek = vault.dek;
  const vaultFile = await Vault.fetchVaultFile(newRepo());
  await assert.rejects(vault.rotate(vaultFile, 'not the passphrase', ITER), /bad_secret/);
  const progress = [];
  const { vaultFile: rotated, recoveryCode } = await vault.rotate(vaultFile, 'new test passphrase', ITER, (d, t) => progress.push(`${d}/${t}`));
  assert.ok(progress.length > 0);
  const after = fake.files();
  // Every note and attachment was encrypted again.
  for (const [path, content] of after) {
    if (/^[na]\//.test(path)) assert.notEqual(content, before.get(path), path);
  }
  assert.ok(after.has('.snowlog/keyring.enc'));
  // The new vault opens with the passphrase and everything reads.
  const fresh = Vault.fetchVaultFile(newRepo());
  const dek = await C.unlockVault(await fresh, 'new test passphrase');
  const other = new Vault(newRepo(), dek);
  await other.loadIndex();
  assert.equal(await other.read(id), 'version 2');
  assert.deepEqual(await other.readFile(att.id), new Uint8Array([1, 2, 3, 4]));
  assert.match(await other.readLibrary(), /rotating piece/, 'the drawing library is encrypted again too');
  assert.notEqual(after.get('.snowlog/library.enc'), before.get('.snowlog/library.enc'));
  // The history (encrypted with the old key) is still readable thanks to the keyring.
  const versions = await other.history(id);
  assert.deepEqual(await Promise.all(versions.map((v) => other.readVersion(id, v.ref))), ['version 2', 'version 2', 'version 1']);
  // The old key no longer opens anything new: another device holding it must unlock again.
  const stale = new Vault(newRepo(), oldDek);
  await assert.rejects(stale.loadIndex(), /key_changed/);
  // The new recovery code works; the returned vault.json is the repository's.
  assert.deepEqual(rotated, await Vault.fetchVaultFile(newRepo()));
  const { dek: viaCode } = await C.recoverVault(rotated, recoveryCode, 'another test passphrase');
  const third = new Vault(newRepo(), viaCode);
  await third.loadIndex();
  assert.equal(await third.read(id), 'version 2');
  // The device itself keeps working with the new key.
  await vault.saveNote(id, 'version 3');
  await other.repo.fetchHead();
  assert.equal(await other.readVersion(id, (await other.history(id))[0].ref), 'version 3');
});

test('drawings: stored encrypted, updated, and a copy is kept if they change in two places', async () => {
  const enc = (s) => new TextEncoder().encode(s);
  const { id, path } = await vault.addFile('Drawings', 'house plan.sketch', enc('{"type":"sketch","elements":[]}'));
  assert.equal(path, 'Drawings/house plan.sketch');
  for (const [p, c] of fake.files()) assert.ok(!p.includes('plan') && !c.includes('house') && !c.includes('"sketch"'), p);
  await vault.saveFile(id, enc('v2'));
  const other = new Vault(newRepo(), vault.dek);
  await other.loadIndex();
  assert.equal(new TextDecoder().decode(await other.readFile(id)), 'v2');
  await vault.saveFile(id, enc('v3 laptop'));
  const res = await other.saveFile(id, enc('v3 phone'));
  assert.match(res.conflict.path, /^Drawings\/house plan \(other device .+\)\.sketch$/);
  const check = new Vault(newRepo(), vault.dek);
  await check.loadIndex();
  assert.equal(new TextDecoder().decode(await check.readFile(id)), 'v3 phone');
  assert.equal(new TextDecoder().decode(await check.readFile(res.conflict.id)), 'v3 laptop');
  // Without changes from others: no copy.
  assert.deepEqual(await other.saveFile(id, enc('v4')), {});
});

test('drawings: changes from two devices to different elements are combined', async () => {
  const { mergeScenes, parseScene, serializeScene, emptyScene } = await import('../public/js/sketch-scene.js');
  const enc = (scene) => new TextEncoder().encode(serializeScene(scene));
  const dec = (b) => parseScene(new TextDecoder().decode(b));
  const merge = (b, m, t) => {
    const r = mergeScenes(dec(b), dec(m), dec(t));
    return { bytes: enc(r.scene), conflict: r.conflict };
  };
  const box = (id, x) => ({ id, type: 'rectangle', x, y: 0, w: 10, h: 10, seed: 1 });
  const base = { ...emptyScene(), elements: [box('a', 0), box('b', 20)] };
  const { id } = await vault.addFile('Drawings', 'combine.sketch', enc(base));
  const other = new Vault(newRepo(), vault.dek);
  await other.loadIndex();
  await other.readFile(id);
  await vault.saveFile(id, enc({ ...base, elements: [box('a', 100), box('b', 20)] }), { merge });
  const res = await other.saveFile(id, enc({ ...base, elements: [box('a', 0), box('b', 20), box('c', 40)] }), { merge });
  assert.equal(res.conflict, undefined, 'no copy');
  assert.ok(res.merged);
  const check = new Vault(newRepo(), vault.dek);
  await check.loadIndex();
  const got = dec(await check.readFile(id));
  assert.deepEqual(got.elements.map((e) => [e.id, e.x]), [['a', 100], ['b', 20], ['c', 40]]);
  // The same element changed on both: they are combined and the other version is also kept apart.
  await check.saveFile(id, enc({ ...got, elements: [box('a', 1), box('b', 20), box('c', 40)] }), { merge });
  const res2 = await other.saveFile(id, enc({ ...got, elements: [box('a', 2), box('b', 20), box('c', 40)] }), { merge });
  assert.ok(res2.conflict);
  assert.equal(dec(res2.merged).elements[0].x, 2);
  for (const [p, c] of fake.files()) assert.ok(!c.includes('combine') && !c.includes('rectangle'), p);
});

test('changes on two devices in the same millisecond are still noticed (version = date + rev)', async () => {
  // Every save gets the same date: before `rev`, the second device couldn't tell the note had changed and
  // overwrote it.
  const realIso = Date.prototype.toISOString;
  Date.prototype.toISOString = () => '2026-01-01T00:00:00.000Z';
  try {
    const id = await vault.createNote('Same time', 'first');
    const other = new Vault(newRepo(), vault.dek);
    await other.loadIndex();
    await other.read(id);
    await vault.saveNote(id, 'here');
    const res = await other.saveNote(id, 'there');
    assert.ok(res.conflict, 'the other version is kept apart');
    const check = new Vault(newRepo(), vault.dek);
    await check.loadIndex();
    assert.equal(await check.read(id), 'there');
    assert.equal(await check.read(res.conflict.id), 'here', 'nothing was lost');
  } finally {
    Date.prototype.toISOString = realIso;
  }
  assert.match(vault.versionOf(Object.keys(vault.index.notes)[0]), /\|/);
});

test('the drawing library: encrypted in the repository, read from another device', async () => {
  await vault.saveLibrary('{"type":"bsketchlib","version":1,"items":[{"name":"Secret server","elements":[]}]}');
  for (const [path, content] of fake.files()) assert.ok(!content.includes('Secret server'), `${path} in plaintext`);
  const other = new Vault(newRepo(), vault.dek);
  await other.loadIndex();
  assert.match(await other.readLibrary(), /Secret server/);
});

test('a note whose encrypted file was deleted in the repository is an error, not an empty note', async () => {
  const id = await vault.createNote(`Gone ${Date.now()}`, 'something worth keeping');
  const path = [...fake.files().keys()].find((p) => p.includes(id) && p.endsWith('.enc'));
  assert.ok(path, 'the note has its file');
  fake.externalDelete(path);
  const other = new Vault(newRepo(), vault.dek); // another device with the same key
  await other.loadIndex();
  await assert.rejects(other.read(id), /missing_note/);
});
