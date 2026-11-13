// La bóveda: índice cifrado + notas cifradas en el repo privado.
//
// Estructura en el repo de notas:
//   .snowlog/vault.json   parámetros públicos y la clave de datos envuelta (sin secretos en claro)
//   .snowlog/index.enc    índice cifrado: rutas y fechas de las notas, carpetas
//   n/<id>.enc            una nota cifrada; <id> es aleatorio y no revela el título
//   a/<id>.enc            un adjunto cifrado (imagen, PDF…); su nombre y tipo van en el índice

import * as C from './crypto.js';
import { merge3 } from './merge.js';

export const VAULT_FILE = '.snowlog/vault.json';
export const INDEX_FILE = '.snowlog/index.enc';
const notePath = (id) => `n/${id}.enc`;
const filePath = (id) => `a/${id}.enc`;

// Adjuntos que se pueden pegar o arrastrar, con su tipo.
export const ATTACHMENT_TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', bmp: 'image/bmp', pdf: 'application/pdf',
};
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const extOf = (name) => (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
export const isAttachmentName = (name) => Object.hasOwn(ATTACHMENT_TYPES, extOf(name));

const WELCOME = `Tu cuaderno personal, cifrado de extremo a extremo.

## Lo básico
- Las notas se guardan solas al dejar de escribir.
- **Ctrl+E** cambia entre editar y leer.
- **Ctrl+O** abre el selector rápido de notas.
- **Ctrl+N** crea una nota nueva.
- Enlaza notas con [[Otra nota]]: si no existe, se crea al pulsarla.

## Formato
- [x] Listas de tareas
- **Negrita**, *cursiva*, ~~tachado~~ y ==resaltado==
- \`código en línea\` y bloques de código

| Formato | Cómo se escribe |
| --- | --- |
| Tabla | \`| a | b |\` y debajo \`|---|---|\` |
| Callout | \`> [!tip] Título\` |
| Etiqueta | #idea |

> [!tip] Callouts
> Usa [!note], [!info], [!warning], [!danger], [!example]… y añade - para plegarlos.

> [!info] Privado de verdad
> En el repo solo hay ficheros ilegibles. Sin tu frase de paso, nadie puede leer esto.
`;

// Nombre de la copia que guarda la versión de otro dispositivo.
export function conflictName(name, date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${name} (otro dispositivo ${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}${p(date.getMinutes())})`;
}

// fetch falla con TypeError cuando no hay red (no cuando GitHub responde con un error).
export const isNetworkError = (e) => e instanceof TypeError || e?.name === 'TypeError';

export function normalizePath(path) {
  return path
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .join('/');
}

export function baseName(path) {
  const parts = path.split('/');
  return parts[parts.length - 1];
}

export function parentPath(path) {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

export function validName(path) {
  if (!path) throw new Error('empty_name');
  if (path.length > 300) throw new Error('name_too_long');
  if (/[\\:*?"<>|#^[\]]/.test(path)) throw new Error('bad_chars');
}

export class Vault {
  // store: caché opcional de ficheros cifrados (cache.js) para no volver a bajar lo que no cambió.
  constructor(repo, dek, { store = null } = {}) {
    this.repo = repo;
    this.dek = dek;
    this.store = store;
    // Sin conexión: los guardados y las notas nuevas esperan en `outbox` (cifrada en la caché)
    // hasta que vuelva la red y se llame a sync().
    this.offline = false;
    this.outbox = new Map();
    this.index = { v: 1, notes: {}, folders: [], files: {} };
    this.cache = new Map();
    this.fileCache = new Map();
    // Fecha `updated` de cada nota cuando se leyó o guardó aquí: si al guardar el índice
    // trae otra, es que la nota cambió en otro dispositivo mientras tanto.
    this.base = new Map();
    // Texto de esa misma versión: la base para juntar cambios de dos dispositivos.
    this.baseText = new Map();
  }

  remember(id, text) {
    this.cache.set(id, text);
    this.base.set(id, this.index.notes[id]?.updated);
    this.baseText.set(id, text);
  }

  static async fetchVaultFile(repo) {
    await repo.fetchHead();
    const text = await repo.readText(VAULT_FILE);
    return text ? JSON.parse(text) : null;
  }

  // Crea la bóveda en un repo sin ella. Devuelve { vault, recoveryCode }.
  static async create(repo, passphrase, iterations) {
    await repo.fetchHead();
    if (await repo.readText(VAULT_FILE)) throw new Error('vault_exists');
    const { vault: vaultFile, dek, recoveryCode } = await C.createVault(passphrase, iterations);
    const json = `${JSON.stringify(vaultFile, null, 2)}\n`;
    if (repo.head) await repo.commit([{ path: VAULT_FILE, content: json }], 'Snowlog: crear bóveda');
    else await repo.createFirstFile(VAULT_FILE, json, 'Snowlog: crear bóveda');
    const vault = new Vault(repo, dek);
    await vault.createNote('Bienvenido', WELCOME);
    return { vault, vaultFile, recoveryCode };
  }

  async loadIndex() {
    let text;
    try {
      text = await this.repo.readText(INDEX_FILE);
      this.offline = false;
      if (text && this.store) await this.store.put('index', { content: text });
    } catch (e) {
      // Sin red: el último índice conocido (con los cambios hechos aquí sin conexión).
      const hit = isNetworkError(e) && this.store && await this.store.get('index');
      if (!hit) throw e;
      text = hit.content;
      this.offline = true;
    }
    await this.loadOutbox();
    if (text) this.index = JSON.parse(await C.decryptText(this.dek, text, 'index'));
    if (!this.index.folders) this.index.folders = [];
    // Lo que otro dispositivo cambió se vuelve a leer del repo (la versión de aquí ya no es la última).
    for (const id of [...this.cache.keys()]) {
      if (this.index.notes[id]?.updated !== this.base.get(id)) this.cache.delete(id);
    }
    if (!this.index.files) this.index.files = {};
  }

  // Guarda en la caché local los ficheros cifrados recién subidos (o los quita si se borraron).
  async cacheChanges(changes) {
    if (!this.store) return;
    for (const c of changes) {
      const m = c.path.match(/^[na]\/([^/]+)\.enc$/);
      if (!m) continue;
      if (c.delete) await this.store.delete(c.path);
      else await this.store.put(c.path, { v: this.versionOf(m[1]), content: c.content });
    }
  }

  // Versión de un fichero según el índice: si coincide con la de la caché, la caché vale.
  versionOf(id) {
    return this.index.notes[id]?.updated || this.index.files?.[id]?.created || null;
  }

  // Lee un fichero cifrado: de la caché si está al día, si no del repo (y lo guarda en la caché).
  async readEncrypted(path, id) {
    const v = this.versionOf(id);
    if (this.store && v) {
      const hit = await this.store.get(path);
      if (hit && hit.v === v && typeof hit.content === 'string') return { content: hit.content, cached: true };
    }
    const content = await this.repo.readText(path);
    if (content != null && this.store && v) await this.store.put(path, { v, content });
    return { content, cached: false };
  }

  // Descarga de golpe las notas que no están en memoria ni en la caché local (para el índice completo).
  // Con GraphQL son 10 peticiones para 1.000 notas en lugar de 1.000. Si falla, no pasa nada:
  // read() las pedirá una a una.
  async prefetch(ids) {
    const want = [];
    for (const id of ids) {
      if (this.cache.has(id) || !this.index.notes[id]) continue;
      const hit = this.store && await this.store.get(notePath(id));
      if (hit && hit.v === this.versionOf(id)) continue;
      want.push(id);
    }
    if (!want.length || this.offline || !this.repo.readMany) return 0;
    let texts;
    try {
      texts = await this.repo.readMany(want.map(notePath));
    } catch {
      return 0;
    }
    let n = 0;
    for (const id of want) {
      const content = texts.get(notePath(id));
      if (content == null) continue;
      try {
        this.remember(id, await C.decryptText(this.dek, content, id));
        if (this.store) await this.store.put(notePath(id), { v: this.versionOf(id), content });
        n += 1;
      } catch { /* se leerá con read() */ }
    }
    return n;
  }

  async indexChange() {
    return { path: INDEX_FILE, content: await C.encryptText(this.dek, JSON.stringify(this.index), 'index') };
  }

  // Aplica un cambio al índice (y ficheros) en un solo commit. Si otro dispositivo
  // escribió antes, recarga el índice, repite el cambio y reintenta una vez.
  async apply(message, mutate, files = async () => []) {
    if (this.offline) throw new Error('offline');
    for (let attempt = 0; attempt < 2; attempt++) {
      const snapshot = structuredClone(this.index);
      try {
        const fileChanges = await files();
        const result = mutate(this.index);
        await this.repo.commit([...fileChanges, await this.indexChange()], message);
        await this.cacheChanges(fileChanges);
        if (this.store) await this.store.put('index', { content: (await this.indexChange()).content });
        return result;
      } catch (e) {
        this.index = snapshot;
        if (isNetworkError(e)) {
          this.offline = true;
          throw new Error('offline');
        }
        if (e.status === 409 && attempt === 0) {
          await this.repo.fetchHead();
          await this.loadIndex();
          continue;
        }
        throw e;
      }
    }
    return undefined;
  }

  notes() {
    return Object.entries(this.index.notes).map(([id, n]) => ({ id, ...n }));
  }

  findByPath(path) {
    const p = normalizePath(path).toLowerCase();
    return this.notes().find((n) => n.path.toLowerCase() === p) || null;
  }

  findByTitle(title) {
    const t = title.trim().toLowerCase();
    return this.findByPath(title) || this.notes().find((n) => baseName(n.path).toLowerCase() === t) || null;
  }

  // Nombre libre: "Sin título", "Sin título 1"…
  freePath(folder, name = 'Sin título') {
    let n = 0;
    for (;;) {
      const candidate = normalizePath(`${folder}/${n ? `${name} ${n}` : name}`);
      if (!this.findByPath(candidate)) return candidate;
      n += 1;
    }
  }

  ensureFree(path, exceptId) {
    const hit = this.findByPath(path);
    if (hit && hit.id !== exceptId) throw new Error('exists');
  }

  addFolderChain(index, folder) {
    const parts = normalizePath(folder).split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
      const f = parts.slice(0, i).join('/');
      if (!index.folders.includes(f)) index.folders.push(f);
    }
  }

  async read(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    let { content, cached } = await this.readEncrypted(notePath(id), id);
    let plain;
    try {
      plain = content ? await C.decryptText(this.dek, content, id) : '';
    } catch (e) {
      // Una copia local dañada o manipulada no se descifra: se vuelve a pedir al repo.
      if (!cached) throw e;
      content = await this.repo.readText(notePath(id));
      plain = content ? await C.decryptText(this.dek, content, id) : '';
      if (content != null) await this.store.put(notePath(id), { v: this.versionOf(id), content });
    }
    this.remember(id, plain);
    return plain;
  }

  async createNote(path, text = '') {
    const p = normalizePath(path);
    validName(p);
    this.ensureFree(p);
    const id = C.randomId();
    const now = new Date().toISOString();
    if (this.offline) return this.createOffline(id, p, text, now);
    try {
      await this.createOnline(id, p, text, now);
    } catch (e) {
      if (e.message !== 'offline') throw e;
      return this.createOffline(id, p, text, now);
    }
    return id;
  }

  async createOffline(id, p, text, now) {
    this.index.notes[id] = { path: p, created: now, updated: now };
    this.addFolderChain(this.index, parentPath(p));
    await this.queue(id, text, true);
    return id;
  }

  async createOnline(id, p, text, now) {
    await this.apply(
      'Snowlog: nueva nota',
      (idx) => {
        idx.notes[id] = { path: p, created: now, updated: now };
        this.addFolderChain(idx, parentPath(p));
      },
      async () => [{ path: notePath(id), content: await C.encryptText(this.dek, text, id) }],
    );
    this.remember(id, text);
    return id;
  }

  // Importa muchas notas de golpe, en lotes (un commit por lote).
  // items: [{ path, text }]. Si un nombre ya existe, añade « (importada)», « (importada 2)»…
  // Devuelve [{ id, path }] en el orden recibido.
  async importNotes(items, { batchSize = 100, onProgress, message = 'importar', folders = [] } = {}) {
    const taken = new Set(this.notes().map((n) => n.path.toLowerCase()));
    const planned = items.map(({ path, text }) => {
      let p = normalizePath(path);
      validName(p);
      if (taken.has(p.toLowerCase())) {
        let n = 1;
        const base = p;
        do {
          p = `${base} (importada${n > 1 ? ` ${n}` : ''})`;
          n += 1;
        } while (taken.has(p.toLowerCase()));
      }
      taken.add(p.toLowerCase());
      return { id: C.randomId(), path: p, text };
    });

    for (let i = 0; i < planned.length; i += batchSize) {
      const batch = planned.slice(i, i + batchSize);
      const now = new Date().toISOString();
      await this.apply(
        `Snowlog: ${message} (${batch.length} notas)`,
        (idx) => {
          if (i === 0) for (const f of folders) this.addFolderChain(idx, f);
          for (const n of batch) {
            idx.notes[n.id] = { path: n.path, created: now, updated: now };
            this.addFolderChain(idx, parentPath(n.path));
          }
        },
        async () => Promise.all(batch.map(async (n) => ({
          path: notePath(n.id),
          content: await C.encryptText(this.dek, n.text, n.id),
        }))),
      );
      for (const n of batch) this.remember(n.id, n.text);
      if (onProgress) onProgress(Math.min(i + batchSize, planned.length), planned.length);
    }
    return planned.map(({ id, path }) => ({ id, path }));
  }

  // Guarda varias notas en un solo commit: [{ id, text }].
  async saveMany(items, message = 'actualizar enlaces') {
    if (!items.length) return;
    const now = new Date().toISOString();
    await this.apply(
      `Snowlog: ${message}`,
      (idx) => {
        for (const { id } of items) if (idx.notes[id]) idx.notes[id].updated = now;
      },
      async () => Promise.all(items.map(async ({ id, text }) => ({ path: notePath(id), content: await C.encryptText(this.dek, text, id) }))),
    );
    for (const { id, text } of items) this.remember(id, text);
  }

  // Guarda la nota. Si otro dispositivo la cambió desde que se leyó aquí, no se pierde nada:
  // esta versión queda en la nota y la otra se guarda como copia al lado.
  // Devuelve { conflict: { id, path } } cuando ha hecho falta la copia.
  async saveNote(id, text) {
    if (this.offline) return this.queue(id, text);
    try {
      return await this.saveOnline(id, text);
    } catch (e) {
      if (e.message !== 'offline') throw e;
      return this.queue(id, text);
    }
  }

  // --- Sin conexión ---
  // Guarda el cambio aquí (memoria y caché cifrada) para subirlo con sync().
  async queue(id, text, isNew = false) {
    const meta = this.index.notes[id];
    const prev = this.outbox.get(id);
    meta.updated = new Date().toISOString();
    this.outbox.set(id, {
      text,
      path: meta.path,
      created: meta.created,
      base: prev ? prev.base : (isNew ? null : this.base.get(id) ?? null),
      baseText: prev ? prev.baseText : (isNew ? null : this.baseText.get(id) ?? null),
      isNew: prev ? prev.isNew : isNew,
    });
    this.cache.set(id, text);
    if (this.store) {
      await this.store.put(notePath(id), { v: meta.updated, content: await C.encryptText(this.dek, text, id) });
      await this.store.put('index', { content: (await this.indexChange()).content });
      await this.saveOutbox();
    }
    return { queued: true };
  }

  async saveOutbox() {
    if (!this.store) return;
    if (!this.outbox.size) return this.store.delete('outbox');
    return this.store.put('outbox', { content: await C.encryptText(this.dek, JSON.stringify([...this.outbox]), 'outbox') });
  }

  async loadOutbox() {
    const hit = this.store && await this.store.get('outbox');
    if (!hit) return;
    try {
      this.outbox = new Map(JSON.parse(await C.decryptText(this.dek, hit.content, 'outbox')));
    } catch { /* de otra clave o dañada: se ignora */ }
  }

  // Vuelve a conectar (recarga el índice) y sube lo pendiente. Cada nota se guarda como un guardado normal, con la detección de
  // conflictos respecto a la versión que había antes de quedarse sin red.
  // Devuelve { synced, conflicts: [{ id, path }] }. Si la red vuelve a fallar, lanza 'offline'.
  async sync() {
    try {
      await this.repo.fetchHead();
    } catch (e) {
      if (isNetworkError(e)) throw new Error('offline');
      throw e;
    }
    const pending = [...this.outbox];
    await this.loadIndex();
    if (this.offline) throw new Error('offline');
    const conflicts = [];
    const merged = [];
    let synced = 0;
    for (const [id, e] of pending) {
      if (e.base) this.base.set(id, e.base);
      else this.base.delete(id);
      if (e.baseText != null) this.baseText.set(id, e.baseText);
      const res = await this.saveOnline(id, e.text, { path: e.path, created: e.created, updated: e.base });
      this.outbox.delete(id);
      await this.saveOutbox();
      synced += 1;
      if (res.conflict) conflicts.push(res.conflict);
      if (res.merged != null) merged.push(id);
    }
    return { synced, conflicts, merged };
  }

  async saveOnline(id, text, meta) {
    const mine = meta || { ...this.index.notes[id] };
    let conflict = null;
    let finalText = text;
    await this.apply(
      'Snowlog: guardar nota',
      (idx) => {
        const now = new Date().toISOString();
        if (!idx.notes[id]) {
          // La borraron en otro dispositivo: se recupera con esta versión.
          idx.notes[id] = { ...mine, path: this.freePathIn(idx, parentPath(mine.path), baseName(mine.path)) };
          this.addFolderChain(idx, parentPath(idx.notes[id].path));
        }
        idx.notes[id].updated = now;
        if (conflict) {
          conflict.path = this.freePathIn(idx, parentPath(idx.notes[id].path), conflictName(baseName(idx.notes[id].path)));
          idx.notes[conflict.id] = { path: conflict.path, created: now, updated: now };
        }
      },
      async () => {
        conflict = null;
        finalText = text;
        const extra = [];
        const remote = this.index.notes[id];
        if (remote && this.base.has(id) && remote.updated !== this.base.get(id)) {
          const theirs = await this.repo.readText(notePath(id));
          const plain = theirs ? await C.decryptText(this.dek, theirs, id) : '';
          if (plain !== text) {
            // Primero se intenta juntar los dos cambios; si chocan, la otra versión va a una copia.
            const baseText = this.baseText.get(id);
            const m = baseText != null ? merge3(baseText, text, plain) : { conflict: true };
            if (!m.conflict) {
              finalText = m.text;
            } else {
              conflict = { id: C.randomId(), text: plain };
              extra.push({ path: notePath(conflict.id), content: await C.encryptText(this.dek, plain, conflict.id) });
            }
          }
        }
        return [{ path: notePath(id), content: await C.encryptText(this.dek, finalText, id) }, ...extra];
      },
    );
    this.remember(id, finalText);
    const out = finalText !== text ? { merged: finalText } : {};
    if (!conflict) return out;
    this.remember(conflict.id, conflict.text);
    return { ...out, conflict: { id: conflict.id, path: conflict.path } };
  }

  // Como freePath, pero sobre un índice concreto (el recargado dentro de apply).
  freePathIn(idx, folder, name) {
    const taken = new Set(Object.values(idx.notes).map((n) => n.path.toLowerCase()));
    for (let n = 0; ; n += 1) {
      const p = normalizePath(`${folder}/${name}${n ? ` ${n}` : ''}`);
      if (!taken.has(p.toLowerCase())) return p;
    }
  }

  async renameNote(id, newPath) {
    const p = normalizePath(newPath);
    validName(p);
    this.ensureFree(p, id);
    // Una nota creada sin conexión aún no está en el repo: se renombra solo aquí.
    const pending = this.outbox.get(id);
    if (pending?.isNew) {
      this.index.notes[id].path = p;
      this.addFolderChain(this.index, parentPath(p));
      pending.path = p;
      if (this.store) {
        await this.store.put('index', { content: (await this.indexChange()).content });
        await this.saveOutbox();
      }
      return;
    }
    await this.apply('Snowlog: renombrar nota', (idx) => {
      if (!idx.notes[id]) throw new Error('missing');
      idx.notes[id].path = p;
      this.addFolderChain(idx, parentPath(p));
    });
  }

  async deleteNote(id) {
    await this.apply(
      'Snowlog: eliminar nota',
      (idx) => {
        delete idx.notes[id];
      },
      async () => [{ path: notePath(id), delete: true }],
    );
    this.cache.delete(id);
  }

  async createFolder(path) {
    const p = normalizePath(path);
    validName(p);
    if (this.index.folders.some((f) => f.toLowerCase() === p.toLowerCase())) throw new Error('exists');
    await this.apply('Snowlog: nueva carpeta', (idx) => this.addFolderChain(idx, p));
  }

  async renameFolder(oldPath, newPath) {
    const from = normalizePath(oldPath);
    const to = normalizePath(newPath);
    validName(to);
    if (to === from) return;
    if (to.toLowerCase().startsWith(`${from.toLowerCase()}/`)) throw new Error('into_itself');
    if (this.index.folders.some((f) => f.toLowerCase() === to.toLowerCase())) throw new Error('exists');
    const moved = (p) => (p === from ? to : p.startsWith(`${from}/`) ? to + p.slice(from.length) : p);
    for (const n of this.notes()) {
      const target = moved(n.path);
      if (target !== n.path) this.ensureFree(target, n.id);
    }
    await this.apply('Snowlog: renombrar carpeta', (idx) => {
      idx.folders = idx.folders.map(moved);
      for (const n of Object.values(idx.notes)) n.path = moved(n.path);
      for (const f of Object.values(idx.files || {})) f.path = moved(f.path);
      this.addFolderChain(idx, to);
    });
  }

  // --- Ajustes de la bóveda (van cifrados dentro del índice, así se comparten entre dispositivos) ---
  getSettings() {
    return { ...(this.index.settings || {}) };
  }

  async saveSettings(settings) {
    await this.apply('Snowlog: ajustes', (idx) => { idx.settings = { ...settings }; });
  }

  // --- Historial ---
  // Versiones de una nota, de la más reciente a la más antigua: [{ ref, date }].
  // La primera es la actual. Git guarda cada versión cifrada; aquí solo se listan.
  async history(id) {
    return (await this.repo.history(notePath(id))).map((c) => ({ ref: c.sha, date: c.date }));
  }

  async readVersion(id, ref) {
    const text = await this.repo.readText(notePath(id), ref);
    return text ? C.decryptText(this.dek, text, id) : '';
  }

  // --- Adjuntos ---
  files() {
    return Object.entries(this.index.files || {}).map(([id, f]) => ({ id, ...f }));
  }

  // ![[foto.png]] o ![[Carpeta/foto.png]]: primero la ruta exacta, luego el nombre.
  findFile(name) {
    const t = normalizePath(name).toLowerCase();
    const all = this.files();
    return all.find((f) => f.path.toLowerCase() === t) || all.find((f) => baseName(f.path).toLowerCase() === baseName(t)) || null;
  }

  // Nombre libre para un adjunto: "foto.png", "foto 1.png"…
  freeFilePath(folder, name) {
    const ext = extOf(name);
    const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
    const taken = new Set(this.files().map((f) => f.path.toLowerCase()));
    for (let n = 0; ; n += 1) {
      const p = normalizePath(`${folder}/${stem}${n ? ` ${n}` : ''}${ext ? `.${ext}` : ''}`);
      if (!taken.has(p.toLowerCase())) return p;
    }
  }

  checkAttachment(name, bytes) {
    if (!isAttachmentName(name)) throw new Error('bad_type');
    if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error('too_big');
  }

  // Guarda un adjunto cifrado. Devuelve { id, path } (el nombre puede cambiar si ya existía).
  async addFile(folder, name, bytes) {
    const clean = name.replace(/[\\/:*?"<>|#^[\]]/g, '-').trim() || 'adjunto';
    this.checkAttachment(clean, bytes);
    const path = this.freeFilePath(normalizePath(folder), clean);
    validName(path);
    const id = C.randomId();
    const now = new Date().toISOString();
    const content = C.toB64(await C.encryptBytes(this.dek, bytes, id));
    await this.apply(`Snowlog: añadir adjunto`, (idx) => {
      if (!idx.files) idx.files = {};
      idx.files[id] = { path, type: ATTACHMENT_TYPES[extOf(path)], size: bytes.length, created: now };
      this.addFolderChain(idx, parentPath(path));
    }, async () => [{ path: filePath(id), content }]);
    this.fileCache.set(id, bytes);
    return { id, path };
  }

  async readFile(id) {
    if (this.fileCache.has(id)) return this.fileCache.get(id);
    const { content: b64 } = await this.readEncrypted(filePath(id), id);
    if (b64 == null) throw new Error('missing');
    const bytes = await C.decryptBytes(this.dek, C.fromB64(b64.trim()), id);
    this.fileCache.set(id, bytes);
    return bytes;
  }

  async deleteFile(id) {
    await this.apply('Snowlog: eliminar adjunto', (idx) => { delete idx.files[id]; }, async () => [{ path: filePath(id), delete: true }]);
    this.fileCache.delete(id);
  }

  notesUnder(folder) {
    return this.notes().filter((n) => n.path.startsWith(`${folder}/`));
  }

  // Borra la carpeta, sus subcarpetas y todas sus notas.
  async deleteFolder(folder) {
    const f = normalizePath(folder);
    const ids = this.notesUnder(f).map((n) => n.id);
    const fids = this.files().filter((x) => x.path.startsWith(`${f}/`)).map((x) => x.id);
    await this.apply(
      'Snowlog: eliminar carpeta',
      (idx) => {
        idx.folders = idx.folders.filter((x) => x !== f && !x.startsWith(`${f}/`));
        for (const id of ids) delete idx.notes[id];
        for (const id of fids) delete idx.files[id];
      },
      async () => [...ids.map((id) => ({ path: notePath(id), delete: true })), ...fids.map((id) => ({ path: filePath(id), delete: true }))],
    );
    for (const id of ids) this.cache.delete(id);
    for (const id of fids) this.fileCache.delete(id);
  }

  // Guarda en el repo un vault.json actualizado (tras recuperar con el código).
  async writeVaultFile(vaultFile, message = 'cambiar frase de paso') {
    const change = [{ path: VAULT_FILE, content: `${JSON.stringify(vaultFile, null, 2)}\n` }];
    try {
      await this.repo.commit(change, `Snowlog: ${message}`);
    } catch (e) {
      if (e.status !== 409) throw e;
      await this.repo.fetchHead();
      await this.repo.commit(change, `Snowlog: ${message}`);
    }
  }
}
