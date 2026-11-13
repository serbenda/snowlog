// Bóveda local: las notas son ficheros .md normales dentro de una carpeta, como en Obsidian.
// Funciona con una carpeta del ordenador (File System Access API, Chrome y Edge) o con el
// almacenamiento privado del navegador (OPFS, todos los navegadores modernos).
// No hay red ni cifrado: los ficheros son tuyos y se pueden abrir con cualquier editor.
//
// Tiene la misma interfaz que Vault (vault.js), así que la app no distingue una de otra.

import { randomId } from './crypto.js';
import { merge3 } from './merge.js';
import { Vault, normalizePath, parentPath, baseName, validName, isAttachmentName, extOf, ATTACHMENT_TYPES, conflictName } from './vault.js';

const HIDDEN = /^\./; // .obsidian, .git, .trash… no se tocan
const TRASH = '.trash';
// Historial en local: copias de versiones anteriores en .history/<ruta de la nota>/<fecha>.md,
// como mucho una cada 10 minutos y las 50 últimas por nota.
const HISTORY = '.history';
// Ajustes de la carpeta: un JSON normal dentro de una carpeta oculta (viaja con la carpeta).
const SETTINGS = '.snowlog/ajustes.json';
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

// Escribe y devuelve la fecha de modificación que queda (para no confundir lo nuestro con cambios de fuera).
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

// Copia una carpeta entera, adjuntos incluidos (no solo las notas).
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

// Nombre libre en la papelera: "nota.md", "nota 1.md"…
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
  // root: FileSystemDirectoryHandle. label: texto para mostrar (nombre de la carpeta).
  constructor(root, { label, kind = 'folder' } = {}) {
    this.root = root;
    this.label = label || root.name || 'Snowlog';
    this.kind = kind; // 'folder' (carpeta del ordenador) | 'browser' (almacenamiento del navegador)
    this.local = true;
    this.now = () => Date.now();
    this.index = { v: 1, notes: {}, folders: [], files: {} };
    this.cache = new Map();
    this.fileCache = new Map();
    // Texto tal como se leyó o guardó aquí: la base para juntar cambios hechos fuera.
    this.baseText = new Map();
  }

  // Lee la carpeta: notas (.md) y subcarpetas, sin entrar en las ocultas.
  async load() {
    await this.scan(false);
    this.cache.clear();
    this.baseText.clear();
    this.fileCache.clear();
    return this;
  }

  // Vuelve a mirar la carpeta por si algo cambió desde fuera (otro editor, OneDrive, Dropbox…).
  // Conserva los ids de lo que sigue igual. Devuelve { added, removed, changed } con ids de notas.
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
            // Solo cuenta como cambio si el texto es distinto del que tenemos (un «touch» no lo es).
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
    } catch { /* sin ajustes propios */ }
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

  // Si la carpeta se sincroniza (OneDrive, Dropbox…) y el fichero cambió fuera desde que se
  // leyó aquí, esa otra versión se guarda como copia al lado antes de escribir esta.
  async saveNote(id, text) {
    let conflict = null;
    let merged = null;
    const before = this.baseText.has(id) ? this.baseText.get(id) : this.cache.get(id);
    let disk = null;
    try {
      disk = await readFile(this.root, this.file(id));
    } catch { /* borrado fuera: se vuelve a crear */ }
    if (disk != null && disk !== text) await this.snapshot(this.index.notes[id].path, disk);
    if (before != null && disk != null && disk !== before && disk !== text) {
      // Cambió fuera: se juntan los dos cambios si no chocan; si chocan, lo de fuera va a una copia.
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
      // El historial acompaña a la nota.
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

  // Versiones: la actual y las copias del historial, de la más reciente a la más antigua.
  async history(id) {
    const note = this.index.notes[id];
    const out = [{ ref: 'current', date: note.updated }];
    try {
      const dir = await getDir(this.root, `${HISTORY}/${note.path}`);
      const names = [];
      for await (const [name, h] of dir.entries()) if (h.kind === 'file' && name.endsWith('.md')) names.push(name);
      names.sort().reverse();
      for (const name of names) out.push({ ref: name, date: new Date(dateOfStamp(name)).toISOString() });
    } catch { /* sin historial todavía */ }
    return out;
  }

  async readVersion(id, ref) {
    if (ref === 'current') return this.read(id);
    if (!/^[\dTZ.-]+\.md$/.test(ref)) throw new Error('missing');
    return readFile(this.root, `${HISTORY}/${this.index.notes[id].path}/${ref}`);
  }

  // Borrar = mover a .trash dentro de la carpeta (se puede recuperar a mano).
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

  // Adjuntos: ficheros normales dentro de la carpeta.
  async addFile(folder, name, bytes) {
    const clean = name.replace(/[\\/:*?"<>|#^[\]]/g, '-').trim() || 'adjunto';
    this.checkAttachment(clean, bytes);
    let path = this.freeFilePath(normalizePath(folder), clean);
    validName(path);
    // También puede haber en la carpeta un fichero que no estaba en el índice.
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

  // Guarda una versión nueva de un dibujo. Si el fichero cambió fuera desde que se leyó, lo de fuera
  // se guarda como copia al lado.
  async saveFile(id, bytes) {
    const meta = this.index.files[id];
    if (!meta) throw new Error('missing');
    this.checkAttachment(meta.path, bytes);
    let conflict = null;
    const before = this.fileCache.get(id);
    let disk = null;
    try {
      const dir = await getDir(this.root, parentPath(meta.path));
      disk = new Uint8Array(await (await (await dir.getFileHandle(baseName(meta.path))).getFile()).arrayBuffer());
    } catch { /* borrado fuera: se vuelve a crear */ }
    const eq = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
    if (before && disk && !eq(disk, before) && !eq(disk, bytes)) {
      const name = baseName(meta.path);
      const ext = extOf(name);
      const res = await this.addFile(parentPath(meta.path), `${conflictName(name.slice(0, -(ext.length + 1)))}.${ext}`, disk);
      conflict = res;
    }
    await writeFile(this.root, meta.path, bytes);
    meta.size = bytes.length;
    meta.updated = iso();
    this.fileCache.set(id, bytes);
    return conflict ? { conflict } : {};
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
          p = `${base} (importada${n > 1 ? ` ${n}` : ''})`;
          n += 1;
        } while (taken.has(p.toLowerCase()));
      }
      taken.add(p.toLowerCase());
      out.push({ id: await this.createNote(p, items[i].text), path: p });
      if (onProgress && ((i + 1) % 25 === 0 || i + 1 === items.length)) onProgress(i + 1, items.length);
    }
    return out;
  }

  // Todas las notas, para exportar: [{ path: 'Carpeta/Nota.md', text }].
  async exportAll() {
    const out = [];
    for (const n of this.notes()) out.push({ path: `${n.path}.md`, text: await this.read(n.id) });
    for (const f of this.files()) out.push({ path: f.path, data: await this.readFile(f.id) });
    return out;
  }
}

// Métodos que no dependen de dónde se guardan las notas: se reutilizan tal cual.
for (const m of ['notes', 'findByPath', 'findByTitle', 'freePath', 'ensureFree', 'addFolderChain', 'notesUnder', 'files', 'findFile', 'freeFilePath', 'checkAttachment']) {
  LocalVault.prototype[m] = Vault.prototype[m];
}
