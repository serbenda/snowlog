// Local vault: notes are plain .md files inside a folder, like in other Markdown notes apps.
// It works with a folder on the computer (File System Access API, Chrome and Edge) or with the
// browser's private storage (OPFS, every modern browser).
// No network and no encryption: the files are yours and open in any editor.
//
// It has the same interface as Vault (vault.js), so the app cannot tell one from the other.

import { randomId } from './crypto.js';
import { merge3 } from './merge.js';
import { Vault, normalizePath, parentPath, baseName, validName, isAttachmentName, extOf, ATTACHMENT_TYPES, conflictName } from './vault.js';

const HIDDEN = /^\./; // .obsidian, .git, .trash… are left alone
const TRASH = '.trash';
// Local history: copies of earlier versions in .history/<note path>/<date>.md,
// at most one every 10 minutes and the last 50 per note.
const HISTORY = '.history';
// Folder settings: a plain JSON inside a hidden folder (it travels with the folder).
const SETTINGS = '.snowlog/settings.json';
// Name used before the interface was translated to English: still read if there is no settings.json.
const LEGACY_SETTINGS = '.snowlog/ajustes.json';
const SNAP_EVERY_MS = 10 * 60 * 1000;
const SNAP_KEEP = 50;
const stampOf = (ms) => `${new Date(ms).toISOString().replace(/:/g, '-')}.md`;
const dateOfStamp = (name) => name.replace(/\.md$/, '').replace(/T(\d\d)-(\d\d)-(\d\d)/, 'T$1:$2:$3');
const iso = (ms) => new Date(ms || Date.now()).toISOString();

async function getDir(root, path, create = false) {
  let dir = root;
  for (const part of path.split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(part, { create });
  return dir;
}

// Writes and returns the resulting modification date (so our changes are not mistaken for outside ones).
async function writeFile(root, path, data) {
  const dir = await getDir(root, parentPath(path), true);
  const fh = await dir.getFileHandle(baseName(path), { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
  return (await fh.getFile()).lastModified;
}

async function readFile(root, path) {
  const dir = await getDir(root, parentPath(path));
  return (await (await dir.getFileHandle(baseName(path))).getFile()).text();
}

async function removeEntry(root, path, recursive = false) {
  const dir = await getDir(root, parentPath(path));
  await dir.removeEntry(baseName(path), { recursive });
}

// Copies a whole folder, attachments included (not only the notes).
async function copyTree(from, to) {
  for await (const [name, h] of from.entries()) {
    if (h.kind === 'directory') {
      await copyTree(h, await to.getDirectoryHandle(name, { create: true }));
    } else {
      const fh = await to.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(await (await h.getFile()).arrayBuffer());
      await w.close();
    }
  }
}

async function fileExists(root, path) {
  try {
    await (await getDir(root, parentPath(path))).getFileHandle(baseName(path));
    return true;
  } catch {
    return false;
  }
}

async function exists(root, path) {
  try {
    await getDir(root, path);
    return true;
  } catch {
    return false;
  }
}

// A free name in the trash: "note.md", "note 1.md"…
async function freeTrashPath(root, path, ext) {
  for (let n = 0; ; n += 1) {
    const candidate = `${TRASH}/${path}${n ? ` ${n}` : ''}${ext}`;
    try {
      const dir = await getDir(root, parentPath(candidate));
      if (ext) await dir.getFileHandle(baseName(candidate));
      else await dir.getDirectoryHandle(baseName(candidate));
    } catch {
      return candidate;
    }
  }
}

export class LocalVault {
  // root: FileSystemDirectoryHandle. label: text to show (the folder name).
  constructor(root, { label, kind = 'folder' } = {}) {
    this.root = root;
    this.label = label || root.name || 'Snowlog';
    this.kind = kind; // 'folder' (a folder on the computer) | 'browser' (the browser's storage)
    this.local = true;
    this.now = () => Date.now();
    this.index = { v: 1, notes: {}, folders: [], files: {} };
    this.cache = new Map();
    this.fileCache = new Map();
    // Text as it was read or saved here: the base for combining changes made outside.
    this.baseText = new Map();
  }

  // Reads the folder: notes (.md) and subfolders, without entering hidden ones.
  async load() {
    await this.scan(false);
    this.cache.clear();
    this.baseText.clear();
    this.fileCache.clear();
    return this;
  }

  // Looks at the folder again in case something changed outside (another editor, OneDrive, Dropbox…).
  // Keeps the ids of what is unchanged. Returns { added, removed, changed } with note ids.
  async rescan() {
    return this.scan(true);
  }

  async scan(keep) {
    const old = this.index;
    const byPath = new Map(Object.entries(old.notes || {}).map(([id, n]) => [n.path.toLowerCase(), id]));
    const filesByPath = new Map(Object.entries(old.files || {}).map(([id, f]) => [f.path.toLowerCase(), id]));
    const notes = {};
    const folders = [];
    const files = {};
    const changed = [];
    const added = [];
    const walk = async (dir, prefix) => {
      for await (const [name, h] of dir.entries()) {
        if (HIDDEN.test(name)) continue;
        const path = prefix ? `${prefix}/${name}` : name;
        if (h.kind === 'directory') {
          folders.push(path);
          await walk(h, path);
        } else if (/\.md$/i.test(name)) {
          const file = await h.getFile();
          const p = path.replace(/\.md$/i, '');
          const id = keep && byPath.get(p.toLowerCase());
          if (!id) {
            notes[randomId()] = { path: p, created: iso(file.lastModified), updated: iso(file.lastModified), mtime: file.lastModified };
            if (keep) added.push(p);
            continue;
          }
          const meta = { ...old.notes[id], path: p };
          if (meta.mtime !== file.lastModified) {
            meta.mtime = file.lastModified;
            meta.updated = iso(file.lastModified);
            // Only counts as a change if the text differs from ours (a “touch” does not).
            if (!this.cache.has(id) || this.cache.get(id) !== await file.text()) {
              changed.push(id);
              this.cache.delete(id);
            }
          }
          notes[id] = meta;
        } else if (isAttachmentName(name)) {
          const file = await h.getFile();
          const id = (keep && filesByPath.get(path.toLowerCase())) || randomId();
          files[id] = { path, type: ATTACHMENT_TYPES[extOf(name)], size: file.size, created: iso(file.lastModified) };
          if (keep && old.files?.[id]?.size !== file.size) this.fileCache.delete(id);
        }
      }
    };
    await walk(this.root, '');
    let settings = {};
    try {
      settings = JSON.parse(await readFile(this.root, SETTINGS));
    } catch {
      try {
        settings = JSON.parse(await readFile(this.root, LEGACY_SETTINGS));
      } catch { /* no settings of its own */ }
    }
    this.index = { v: 1, notes, folders, files, settings };
    const removed = keep ? Object.keys(old.notes || {}).filter((id) => !notes[id]) : [];
    for (const id of removed) {
      this.cache.delete(id);
      this.baseText.delete(id);
    }
    const addedIds = Object.entries(notes).filter(([, n]) => added.includes(n.path)).map(([id]) => id);
    return { added: addedIds, removed, changed };
  }

  file(id) { return `${this.index.notes[id].path}.md`; }

  async read(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const text = await readFile(this.root, this.file(id));
    this.cache.set(id, text);
    this.baseText.set(id, text);
    return text;
  }

  async createNote(path, text = '') {
    const p = normalizePath(path);
    validName(p);
    this.ensureFree(p);
    const mtime = await writeFile(this.root, `${p}.md`, text);
    const id = randomId();
    const now = iso();
    this.index.notes[id] = { path: p, created: now, updated: now, mtime };
    this.addFolderChain(this.index, parentPath(p));
    this.cache.set(id, text);
    this.baseText.set(id, text);
    return id;
  }

  // If the folder is synced (OneDrive, Dropbox…) and the file changed outside since it was
  // read here, that other version is saved as a copy beside it before writing this one.
  async saveNote(id, text) {
    let conflict = null;
    let merged = null;
    const before = this.baseText.has(id) ? this.baseText.get(id) : this.cache.get(id);
    let disk = null;
    try {
      disk = await readFile(this.root, this.file(id));
    } catch { /* deleted outside: it is created again */ }
    if (disk != null && disk !== text) await this.snapshot(this.index.notes[id].path, disk);
    if (before != null && disk != null && disk !== before && disk !== text) {
      // Changed outside: both changes are combined if they do not clash; if they do, the outside one goes to a copy.
      const m = merge3(before, text, disk);
      if (!m.conflict) {
        merged = m.text;
      } else {
        const note = this.index.notes[id];
        const path = this.freePath(parentPath(note.path), conflictName(baseName(note.path)));
        conflict = { id: await this.createNote(path, disk), path };
      }
    }
    const final = merged ?? text;
    this.index.notes[id].mtime = await writeFile(this.root, this.file(id), final);
    this.index.notes[id].updated = iso();
    this.cache.set(id, final);
    this.baseText.set(id, final);
    const out = final !== text ? { merged: final } : {};
    return conflict ? { ...out, conflict } : out;
  }

  async saveMany(items) {
    for (const { id, text } of items) await this.saveNote(id, text);
  }

  async renameNote(id, newPath) {
    const p = normalizePath(newPath);
    validName(p);
    this.ensureFree(p, id);
    const note = this.index.notes[id];
    if (!note) throw new Error('missing');
    if (note.path === p) return;
    const text = await this.read(id);
    note.mtime = await writeFile(this.root, `${p}.md`, text);
    if (note.path.toLowerCase() !== p.toLowerCase()) {
      await removeEntry(this.root, this.file(id));
      // The history goes with the note.
      if (await exists(this.root, `${HISTORY}/${note.path}`) && !await exists(this.root, `${HISTORY}/${p}`)) {
        await copyTree(await getDir(this.root, `${HISTORY}/${note.path}`), await getDir(this.root, `${HISTORY}/${p}`, true));
        await removeEntry(this.root, `${HISTORY}/${note.path}`, true);
      }
    }
    note.path = p;
    this.addFolderChain(this.index, parentPath(p));
  }

  async snapshot(path, text) {
    const dir = await getDir(this.root, `${HISTORY}/${path}`, true);
    const names = [];
    for await (const [name, h] of dir.entries()) if (h.kind === 'file' && name.endsWith('.md')) names.push(name);
    names.sort();
    const last = names.at(-1);
    if (last && this.now() - Date.parse(dateOfStamp(last)) < SNAP_EVERY_MS) return;
    await writeFile(this.root, `${HISTORY}/${path}/${stampOf(this.now())}`, text);
    names.push('');
    for (const old of names.slice(0, Math.max(0, names.length - SNAP_KEEP))) await dir.removeEntry(old);
  }

  // Versions: the current one and the history copies, newest first.
  async history(id) {
    const note = this.index.notes[id];
    const out = [{ ref: 'current', date: note.updated }];
    try {
      const dir = await getDir(this.root, `${HISTORY}/${note.path}`);
      const names = [];
      for await (const [name, h] of dir.entries()) if (h.kind === 'file' && name.endsWith('.md')) names.push(name);
      names.sort().reverse();
      for (const name of names) out.push({ ref: name, date: new Date(dateOfStamp(name)).toISOString() });
    } catch { /* no history yet */ }
    return out;
  }

  async readVersion(id, ref) {
    if (ref === 'current') return this.read(id);
    if (!/^[\dTZ.-]+\.md$/.test(ref)) throw new Error('missing');
    return readFile(this.root, `${HISTORY}/${this.index.notes[id].path}/${ref}`);
  }

  // Delete = move to .trash inside the folder (it can be recovered by hand).
  async deleteNote(id) {
    const text = await this.read(id);
    const path = this.index.notes[id].path;
    await writeFile(this.root, await freeTrashPath(this.root, path, '.md'), text);
    await removeEntry(this.root, `${path}.md`);
    delete this.index.notes[id];
    this.cache.delete(id);
  }

  async createFolder(path) {
    const p = normalizePath(path);
    validName(p);
    if (this.index.folders.some((f) => f.toLowerCase() === p.toLowerCase())) throw new Error('exists');
    await getDir(this.root, p, true);
    this.addFolderChain(this.index, p);
  }

  async renameFolder(oldPath, newPath) {
    const from = normalizePath(oldPath);
    const to = normalizePath(newPath);
    validName(to);
    if (to === from) return;
    if (to.toLowerCase().startsWith(`${from.toLowerCase()}/`)) throw new Error('into_itself');
    if (this.index.folders.some((f) => f.toLowerCase() === to.toLowerCase()) || await exists(this.root, to)) throw new Error('exists');
    await copyTree(await getDir(this.root, from), await getDir(this.root, to, true));
    await removeEntry(this.root, from, true);
    const moved = (q) => (q === from ? to : q.startsWith(`${from}/`) ? to + q.slice(from.length) : q);
    this.index.folders = this.index.folders.map(moved);
    for (const n of Object.values(this.index.notes)) n.path = moved(n.path);
    for (const f of Object.values(this.index.files)) f.path = moved(f.path);
    this.addFolderChain(this.index, to);
  }

  async deleteFolder(folder) {
    const f = normalizePath(folder);
    if (await exists(this.root, f)) {
      const target = await freeTrashPath(this.root, f, '');
      await copyTree(await getDir(this.root, f), await getDir(this.root, target, true));
      await removeEntry(this.root, f, true);
    }
    for (const n of this.notesUnder(f)) {
      delete this.index.notes[n.id];
      this.cache.delete(n.id);
    }
    for (const x of this.files()) {
      if (x.path.startsWith(`${f}/`)) {
        delete this.index.files[x.id];
        this.fileCache.delete(x.id);
      }
    }
    this.index.folders = this.index.folders.filter((x) => x !== f && !x.startsWith(`${f}/`));
  }

  getSettings() {
    return { ...(this.index.settings || {}) };
  }

  async saveSettings(settings) {
    await writeFile(this.root, SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
    this.index.settings = { ...settings };
  }

  // Attachments: plain files inside the folder.
  async addFile(folder, name, bytes) {
    const clean = name.replace(/[\\/:*?"<>|#^[\]]/g, '-').trim() || 'adjunto';
    this.checkAttachment(clean, bytes);
    let path = this.freeFilePath(normalizePath(folder), clean);
    validName(path);
    // There may also be a file in the folder that was not in the index.
    for (let n = 1; await fileExists(this.root, path); n += 1) {
      const ext = extOf(clean);
      path = normalizePath(`${folder}/${clean.slice(0, -(ext.length + 1))} ${n}.${ext}`);
    }
    await writeFile(this.root, path, bytes);
    const id = randomId();
    this.index.files[id] = { path, type: ATTACHMENT_TYPES[extOf(path)], size: bytes.length, created: iso() };
    this.addFolderChain(this.index, parentPath(path));
    this.fileCache.set(id, bytes);
    return { id, path };
  }

  async readFile(id) {
    if (this.fileCache.has(id)) return this.fileCache.get(id);
    const dir = await getDir(this.root, parentPath(this.index.files[id].path));
    const bytes = new Uint8Array(await (await (await dir.getFileHandle(baseName(this.index.files[id].path))).getFile()).arrayBuffer());
    this.fileCache.set(id, bytes);
    return bytes;
  }

  // Saves a new version of a drawing. If the file changed outside since it was read,
  // `merge(base, mine, outside)` can combine both versions ({ bytes, conflict }); if it cannot,
  // or they clash, the outside one is saved as a copy beside it. Returns { merged?, conflict? }.
  async saveFile(id, bytes, { merge = null } = {}) {
    const meta = this.index.files[id];
    if (!meta) throw new Error('missing');
    this.checkAttachment(meta.path, bytes);
    let conflict = null;
    let out = bytes;
    const before = this.fileCache.get(id);
    let disk = null;
    try {
      const dir = await getDir(this.root, parentPath(meta.path));
      disk = new Uint8Array(await (await (await dir.getFileHandle(baseName(meta.path))).getFile()).arrayBuffer());
    } catch { /* deleted outside: it is created again */ }
    const eq = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
    if (before && disk && !eq(disk, before) && !eq(disk, bytes)) {
      let joined = null;
      try {
        joined = merge ? merge(before, bytes, disk) : null;
      } catch { /* could not combine: copy */ }
      if (joined?.bytes) {
        this.checkAttachment(meta.path, joined.bytes);
        out = joined.bytes;
      }
      if (!joined?.bytes || joined.conflict) {
        const name = baseName(meta.path);
        const ext = extOf(name);
        conflict = await this.addFile(parentPath(meta.path), `${conflictName(name.slice(0, -(ext.length + 1)))}.${ext}`, disk);
      }
    }
    await writeFile(this.root, meta.path, out);
    meta.size = out.length;
    meta.updated = iso();
    this.fileCache.set(id, out);
    const res = out !== bytes ? { merged: out } : {};
    return conflict ? { ...res, conflict } : res;
  }

  async deleteFile(id) {
    const { path } = this.index.files[id];
    const bytes = await this.readFile(id);
    const ext = extOf(path);
    await writeFile(this.root, await freeTrashPath(this.root, path.slice(0, -(ext.length + 1)), `.${ext}`), bytes);
    await removeEntry(this.root, path);
    delete this.index.files[id];
    this.fileCache.delete(id);
  }

  async importNotes(items, { onProgress, folders = [] } = {}) {
    const taken = new Set(this.notes().map((n) => n.path.toLowerCase()));
    const out = [];
    for (const f of folders) {
      await getDir(this.root, normalizePath(f), true);
      this.addFolderChain(this.index, f);
    }
    for (let i = 0; i < items.length; i++) {
      let p = normalizePath(items[i].path);
      validName(p);
      if (taken.has(p.toLowerCase())) {
        const base = p;
        let n = 1;
        do {
          p = `${base} (imported${n > 1 ? ` ${n}` : ''})`;
          n += 1;
        } while (taken.has(p.toLowerCase()));
      }
      taken.add(p.toLowerCase());
      out.push({ id: await this.createNote(p, items[i].text), path: p });
      if (onProgress && ((i + 1) % 25 === 0 || i + 1 === items.length)) onProgress(i + 1, items.length);
    }
    return out;
  }

  // All notes, for export: [{ path: 'Folder/Note.md', text }].
  async exportAll() {
    const out = [];
    for (const n of this.notes()) out.push({ path: `${n.path}.md`, text: await this.read(n.id) });
    for (const f of this.files()) out.push({ path: f.path, data: await this.readFile(f.id) });
    return out;
  }
}

// Methods that do not depend on where the notes are stored: reused as they are.
for (const m of ['notes', 'findByPath', 'findByTitle', 'freePath', 'ensureFree', 'addFolderChain', 'notesUnder', 'files', 'findFile', 'freeFilePath', 'checkAttachment']) {
  LocalVault.prototype[m] = Vault.prototype[m];
}
