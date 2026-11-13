// Bóveda local: las notas son ficheros .md normales dentro de una carpeta, como en Obsidian.
// Funciona con una carpeta del ordenador (File System Access API, Chrome y Edge) o con el
// almacenamiento privado del navegador (OPFS, todos los navegadores modernos).
// No hay red ni cifrado: los ficheros son tuyos y se pueden abrir con cualquier editor.
//
// Tiene la misma interfaz que Vault (vault.js), así que la app no distingue una de otra.

import { randomId } from './crypto.js';
import { Vault, normalizePath, parentPath, baseName, validName } from './vault.js';

const HIDDEN = /^\./; // .obsidian, .git, .trash… no se tocan
const TRASH = '.trash';
const iso = (ms) => new Date(ms || Date.now()).toISOString();

async function getDir(root, path, create = false) {
  let dir = root;
  for (const part of path.split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(part, { create });
  return dir;
}

async function writeFile(root, path, data) {
  const dir = await getDir(root, parentPath(path), true);
  const fh = await dir.getFileHandle(baseName(path), { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
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
    this.index = { v: 1, notes: {}, folders: [] };
    this.cache = new Map();
  }

  // Lee la carpeta: notas (.md) y subcarpetas, sin entrar en las ocultas.
  async load() {
    const notes = {};
    const folders = [];
    const walk = async (dir, prefix) => {
      for await (const [name, h] of dir.entries()) {
        if (HIDDEN.test(name)) continue;
        const path = prefix ? `${prefix}/${name}` : name;
        if (h.kind === 'directory') {
          folders.push(path);
          await walk(h, path);
        } else if (/\.md$/i.test(name)) {
          const file = await h.getFile();
          notes[randomId()] = { path: path.replace(/\.md$/i, ''), created: iso(file.lastModified), updated: iso(file.lastModified) };
        }
      }
    };
    await walk(this.root, '');
    this.index = { v: 1, notes, folders };
    this.cache.clear();
    return this;
  }

  file(id) { return `${this.index.notes[id].path}.md`; }

  async read(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const text = await readFile(this.root, this.file(id));
    this.cache.set(id, text);
    return text;
  }

  async createNote(path, text = '') {
    const p = normalizePath(path);
    validName(p);
    this.ensureFree(p);
    await writeFile(this.root, `${p}.md`, text);
    const id = randomId();
    const now = iso();
    this.index.notes[id] = { path: p, created: now, updated: now };
    this.addFolderChain(this.index, parentPath(p));
    this.cache.set(id, text);
    return id;
  }

  async saveNote(id, text) {
    await writeFile(this.root, this.file(id), text);
    this.index.notes[id].updated = iso();
    this.cache.set(id, text);
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
    await writeFile(this.root, `${p}.md`, text);
    if (note.path.toLowerCase() !== p.toLowerCase()) await removeEntry(this.root, this.file(id));
    note.path = p;
    this.addFolderChain(this.index, parentPath(p));
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
    this.index.folders = this.index.folders.filter((x) => x !== f && !x.startsWith(`${f}/`));
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
    return out;
  }
}

// Métodos que no dependen de dónde se guardan las notas: se reutilizan tal cual.
for (const m of ['notes', 'findByPath', 'findByTitle', 'freePath', 'ensureFree', 'addFolderChain', 'notesUnder']) {
  LocalVault.prototype[m] = Vault.prototype[m];
}
