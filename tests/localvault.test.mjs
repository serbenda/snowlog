// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemDir } from './memfs.mjs';
import { LocalVault } from '../public/js/localvault.js';
import { makeZip, crc32 } from '../public/js/zip.js';

function sampleFolder() {
  const root = new MemDir('MyNotes');
  root.put('Home.md', '# Home\n[[Renovation]]');
  root.put('Projects/House/Renovation.md', '---\nstatus: active\n---\n# Renovation');
  root.put('Projects/House/plan.png', new Uint8Array([137, 80, 78, 71]));
  root.put('Daily/2026-11-12.md', '- [ ] #commitment something');
  root.put('.obsidian/app.json', '{}');
  root.put('.trash/old.md', 'deleted');
  root.put('Loose notes.txt', 'not a note');
  return root;
}

test('loads only .md notes and visible folders, like a Markdown vault', async () => {
  const v = await new LocalVault(sampleFolder()).load();
  assert.equal(v.label, 'MyNotes');
  assert.deepEqual(v.notes().map((n) => n.path).sort(), ['Daily/2026-11-12', 'Home', 'Projects/House/Renovation']);
  assert.deepEqual(v.index.folders.sort(), ['Daily', 'Projects', 'Projects/House']);
  assert.equal(await v.read(v.findByTitle('renovation').id), '---\nstatus: active\n---\n# Renovation');
});

test('create, save and rename write plain .md files', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  const id = await v.createNote('Ideas/Trip', 'hello');
  assert.equal(root.text('Ideas/Trip.md'), 'hello');
  await v.saveNote(id, 'hello again');
  assert.equal(root.text('Ideas/Trip.md'), 'hello again');
  await v.renameNote(id, 'Ideas/Trip to Japan ñ');
  assert.ok(root.list().includes('Ideas/Trip to Japan ñ.md'));
  assert.ok(!root.list().includes('Ideas/Trip.md'));
  await assert.rejects(v.createNote('Home'), /exists/);
  await assert.rejects(v.createNote('a:b'), /bad_chars/);
});

test('deleting moves to the .trash folder, losing nothing', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  await v.deleteNote(v.findByTitle('Home').id);
  assert.ok(!root.list().includes('Home.md'));
  assert.equal(root.text('.trash/Home.md'), '# Home\n[[Renovation]]');
  await v.deleteFolder('Projects');
  assert.ok(root.list().includes('.trash/Projects/House/plan.png'));
  assert.ok(root.list().includes('.trash/Projects/House/Renovation.md'));
  assert.ok(!root.list().some((p) => p.startsWith('Projects')));
  assert.equal(v.notes().length, 1);
});

test('renaming a folder moves the attachments too', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  await v.renameFolder('Projects/House', 'Projects/Home');
  assert.ok(root.list().includes('Projects/Home/plan.png'));
  assert.ok(root.list().includes('Projects/Home/Renovation.md'));
  assert.ok(!root.list().includes('Projects/House/'));
  assert.equal(v.findByTitle('Renovation').path, 'Projects/Home/Renovation');
  await assert.rejects(v.renameFolder('Projects', 'Daily'), /exists/);
});

test('import and export', async () => {
  const root = new MemDir('empty');
  const v = await new LocalVault(root).load();
  const res = await v.importNotes([{ path: 'A/one', text: '1' }, { path: 'A/one', text: '2' }], { folders: ['Archive'] });
  assert.deepEqual(res.map((r) => r.path), ['A/one', 'A/one (imported)']);
  assert.ok(root.list().includes('Archive/'));
  assert.deepEqual((await v.exportAll()).map((f) => f.path).sort(), ['A/one (imported).md', 'A/one.md']);
});

test('the exported .zip opens with standard tools', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const zip = makeZip([{ path: 'Daily/2026-11-13.md', text: '# Friday ñ' }, { path: 'Home.md', text: 'hello' }]);
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  const file = join(dir, 'notes.zip');
  writeFileSync(file, zip);
  const out = execFileSync('python3', ['-I', '-c',
    'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print("|".join(n+"="+z.read(n).decode() for n in z.namelist()))', file]).toString().trim();
  assert.equal(out, 'Daily/2026-11-13.md=# Friday ñ|Home.md=hello');
});

test('saveMany writes each file locally', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  const id = v.findByTitle('Home').id;
  await v.saveMany([{ id, text: 'new' }]);
  assert.equal(root.text('Home.md'), 'new');
});

test('local attachments: plain files, to the trash on delete and inside the .zip', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  assert.deepEqual(v.files().map((f) => f.path), ['Projects/House/plan.png']);
  const pdf = new TextEncoder().encode('%PDF-1.4 hello');
  const { id, path } = await v.addFile('Projects/House', 'plan.png', new Uint8Array([1]));
  assert.equal(path, 'Projects/House/plan 1.png');
  const doc = await v.addFile('Attachments', 'invoice.pdf', pdf);
  assert.ok(root.list().includes('Attachments/invoice.pdf'));
  assert.deepEqual(await v.readFile(doc.id), pdf);
  await v.deleteFile(id);
  assert.ok(root.list().includes('.trash/Projects/House/plan 1.png'));
  await v.renameFolder('Attachments', 'Docs');
  assert.equal(v.findFile('invoice.pdf').path, 'Docs/invoice.pdf');
  const all = await v.exportAll();
  assert.ok(all.some((f) => f.path === 'Docs/invoice.pdf' && f.data));
  await v.deleteFolder('Docs');
  assert.equal(v.findFile('invoice.pdf'), null);
});

test('if the file changed outside (synced folder), a copy is kept', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  const id = v.findByTitle('Home').id;
  await v.read(id);
  root.put('Home.md', 'changed on the other computer');
  const res = await v.saveNote(id, 'changed here');
  assert.ok(res.conflict);
  assert.equal(root.text('Home.md'), 'changed here');
  assert.equal(root.text(`${res.conflict.path}.md`), 'changed on the other computer');
  assert.deepEqual(await v.saveNote(id, 'no conflict'), {});
});

test('local history: copies every 10 minutes, the last 50, and they follow the note on rename', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  let t = Date.UTC(2026, 10, 13, 9, 0);
  v.now = () => t;
  const id = v.findByTitle('Home').id;
  await v.read(id);
  await v.saveNote(id, 'v2'); // keeps a copy of the previous version
  t += 60 * 1000;
  await v.saveNote(id, 'v3'); // under 10 minutes: no new copy
  t += 11 * 60 * 1000;
  await v.saveNote(id, 'v4');
  const versions = await v.history(id);
  assert.deepEqual(await Promise.all(versions.map((x) => v.readVersion(id, x.ref))), ['v4', 'v3', '# Home\n[[Renovation]]']);
  assert.equal(v.notes().length, 3, 'the history does not show up as notes');
  await v.renameNote(id, 'Front page');
  assert.equal((await v.history(id)).length, 3);
  await assert.rejects(v.readVersion(id, '../../Home.md'), /missing/);
  for (let i = 0; i < 55; i++) { t += 11 * 60 * 1000; await v.saveNote(id, `x${i}`); }
  assert.equal((await v.history(id)).length, 51);
  const again = await new LocalVault(root).load();
  assert.equal(again.notes().length, 3);
});

test('local settings: a JSON in .snowlog that travels with the folder', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  assert.deepEqual(v.getSettings(), {});
  await v.saveSettings({ dailyFolder: 'Journal ñ' });
  assert.match(root.text('.snowlog/settings.json'), /Journal ñ/);
  const again = await new LocalVault(root).load();
  assert.deepEqual(again.getSettings(), { dailyFolder: 'Journal ñ' });
  assert.ok(!again.index.folders.includes('.snowlog'));
});

test('settings saved under the earlier name (.snowlog/ajustes.json) are still read', async () => {
  const root = sampleFolder();
  root.put('.snowlog/ajustes.json', '{ "dailyFolder": "Bitácora" }');
  const v = await new LocalVault(root).load();
  assert.deepEqual(v.getSettings(), { dailyFolder: 'Bitácora' });
  // Saving writes the new name; from then on it is the one that counts.
  await v.saveSettings({ dailyFolder: 'Journal' });
  assert.match(root.text('.snowlog/settings.json'), /Journal/);
  assert.deepEqual((await new LocalVault(root).load()).getSettings(), { dailyFolder: 'Journal' });
  // If settings.json cannot be read, the legacy file is read instead.
  root.put('.snowlog/settings.json', '{ broken');
  assert.deepEqual((await new LocalVault(root).load()).getSettings(), { dailyFolder: 'Bitácora' });
});

test('detects what changes in the folder from outside, keeping the ids', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  const home = v.findByTitle('Home').id;
  const renovation = v.findByTitle('Renovation').id;
  await v.read(home);
  const mine = await v.createNote('Mine', 'written here');
  await v.saveNote(renovation, 'saved here');
  assert.deepEqual(await v.rescan(), { added: [], removed: [], changed: [] }, 'what we wrote ourselves does not count');
  await new Promise((r) => setTimeout(r, 5));
  root.put('Home.md', 'changed with another editor');
  root.children.get('Home.md').mtime = Date.now();
  root.put('New from outside.md', 'hello');
  await root.removeEntry('Mine.md');
  const res = await v.rescan();
  assert.deepEqual(res.changed, [home]);
  assert.deepEqual(res.removed, [mine]);
  assert.equal(res.added.length, 1);
  assert.equal(v.index.notes[res.added[0]].path, 'New from outside');
  assert.equal(await v.read(home), 'changed with another editor');
  assert.equal(v.findByTitle('Renovation').id, renovation, 'the ids are kept');
});

test('outside changes on other lines are combined with the ones made here', async () => {
  const root = sampleFolder();
  root.put('List.md', 'one\ntwo\nthree');
  const v = await new LocalVault(root).load();
  const id = v.findByTitle('List').id;
  await v.read(id);
  root.put('List.md', 'one\ntwo\nthree\nfour (from OneDrive)');
  root.children.get('List.md').mtime = Date.now() + 5;
  await v.rescan(); // sees it changed while typing goes on here
  const res = await v.saveNote(id, 'ONE\ntwo\nthree');
  assert.equal(res.conflict, undefined);
  assert.equal(res.merged, 'ONE\ntwo\nthree\nfour (from OneDrive)');
  assert.equal(root.text('List.md'), 'ONE\ntwo\nthree\nfour (from OneDrive)');
});

test('local drawings: rewritten, and what changed outside is kept as a copy', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  const enc = (s) => new TextEncoder().encode(s);
  const { id } = await v.addFile('Drawings', 'sketch.sketch', enc('one'));
  await v.saveFile(id, enc('two'));
  assert.equal(root.text('Drawings/sketch.sketch'), 'two');
  root.put('Drawings/sketch.sketch', 'changed outside');
  const res = await v.saveFile(id, enc('three'));
  assert.ok(res.conflict);
  assert.equal(root.text('Drawings/sketch.sketch'), 'three');
  assert.equal(root.text(res.conflict.path), 'changed outside');
});

test('local drawings: outside changes to other elements are combined', async () => {
  const { mergeScenes, parseScene, serializeScene, emptyScene } = await import('../public/js/sketch-scene.js');
  const enc = (scene) => new TextEncoder().encode(serializeScene(scene));
  const dec = (b) => parseScene(new TextDecoder().decode(b));
  const merge = (b, m, t) => {
    const r = mergeScenes(dec(b), dec(m), dec(t));
    return { bytes: enc(r.scene), conflict: r.conflict };
  };
  const box = (id, x) => ({ id, type: 'rectangle', x, y: 0, w: 10, h: 10, seed: 1 });
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  const base = { ...emptyScene(), elements: [box('a', 0)] };
  const { id } = await v.addFile('Drawings', 'sketch.sketch', enc(base));
  root.put('Drawings/sketch.sketch', serializeScene({ ...base, elements: [box('a', 0), box('outside', 50)] }));
  const res = await v.saveFile(id, enc({ ...base, elements: [box('a', 9)] }), { merge });
  assert.equal(res.conflict, undefined);
  assert.deepEqual(dec(new TextEncoder().encode(root.text('Drawings/sketch.sketch'))).elements.map((e) => [e.id, e.x]), [['a', 9], ['outside', 50]]);
  // If it cannot be combined (not a drawing), it copies as before.
  root.put('Drawings/sketch.sketch', 'this is not json');
  const res2 = await v.saveFile(id, enc(base), { merge });
  assert.ok(res2.conflict);
});

test('the drawing library is a plain file in the hidden .snowlog folder', async () => {
  const root = sampleFolder();
  const v = await new LocalVault(root).load();
  assert.equal(await v.readLibrary(), null, 'none yet');
  await v.saveLibrary('{"type":"bsketchlib","items":[]}');
  assert.equal(await v.readLibrary(), '{"type":"bsketchlib","items":[]}');
  const again = await new LocalVault(root).load();
  assert.equal(await again.readLibrary(), '{"type":"bsketchlib","items":[]}');
  assert.ok(!again.notes().some((n) => n.path.includes('library')), 'not shown as a note');
});
