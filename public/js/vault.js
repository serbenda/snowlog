// The vault: an encrypted index + encrypted notes in the private repository.
//
// Layout of the notes repository:
//   .snowlog/vault.json   public parameters and the wrapped data key (no secrets in plaintext)
//   .snowlog/index.enc    encrypted index: note paths and dates, folders
//   n/<id>.enc            an encrypted note; <id> is random and does not reveal the title
//   a/<id>.enc            an encrypted attachment (image, PDF…); its name and type are in the index

import * as C from './crypto.js';
import { merge3 } from './merge.js';

export const VAULT_FILE = '.snowlog/vault.json';
export const INDEX_FILE = '.snowlog/index.enc';
// Earlier keys (after rotating), encrypted with the current one: to keep reading the history.
export const KEYRING_FILE = '.snowlog/keyring.enc';
const notePath = (id) => `n/${id}.enc`;
const filePath = (id) => `a/${id}.enc`;

// Attachments that can be pasted or dropped, with their type.
export const ATTACHMENT_TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', bmp: 'image/bmp', pdf: 'application/pdf',
  sketch: 'application/vnd.sketch+json', // drawings from serbenda/sketch
};
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const extOf = (name) => (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
export const isAttachmentName = (name) => Object.hasOwn(ATTACHMENT_TYPES, extOf(name));

const WELCOME = `Your personal notebook, end-to-end encrypted.

## The basics
- Notes save themselves when you stop typing.
- **Ctrl+E** switches between editing and reading.
- **Ctrl+O** opens the quick note switcher.
- **Ctrl+N** creates a new note.
- Link notes with [[Another note]]: if it does not exist, it is created when you click it.

## Formatting
- [x] Task lists
- **Bold**, *italic*, ~~strikethrough~~ and ==highlight==
- \`inline code\` and code blocks

| Format | How to write it |
| --- | --- |
| Table | \`| a | b |\` and below it \`|---|---|\` |
| Callout | \`> [!tip] Title\` |
| Tag | #idea |

> [!tip] Callouts
> Use [!note], [!info], [!warning], [!danger], [!example]… and add - to fold them.

> [!info] Truly private
> The repository only holds unreadable files. Without your passphrase, nobody can read this.
`;

// Name of the copy that keeps another device's version.
export function conflictName(name, date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${name} (other device ${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}${p(date.getMinutes())})`;
}

// fetch fails with TypeError when there is no network (not when GitHub answers with an error).
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

const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export class Vault {
  // store: optional cache of encrypted files (cache.js) so what did not change is not downloaded again.
  constructor(repo, dek, { store = null } = {}) {
    this.repo = repo;
    this.dek = dek;
    this.store = store;
    // Offline: saves and new notes wait in `outbox` (encrypted in the cache)
    // until the network is back and sync() is called.
    this.offline = false;
    this.outbox = new Map();
    this.index = { v: 1, notes: {}, folders: [], files: {} };
    this.cache = new Map();
    this.fileCache = new Map();
    // The `updated` date of each note when it was read or saved here: if the index brings another one
    // on save, the note changed on another device in the meantime.
    this.base = new Map();
    // Text of that same version: the base for combining the changes of two devices.
    this.baseText = new Map();
    // The same for editable attachments (drawings): the version they were read with here.
    this.fileBase = new Map();
    this.fileBaseBytes = new Map(); // content of each attachment as it was read or saved here (for merging)
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

  // Creates the vault in a repository without one. Returns { vault, recoveryCode }.
  static async create(repo, passphrase, iterations) {
    await repo.fetchHead();
    if (await repo.readText(VAULT_FILE)) throw new Error('vault_exists');
    const { vault: vaultFile, dek, recoveryCode } = await C.createVault(passphrase, iterations);
    const json = `${JSON.stringify(vaultFile, null, 2)}\n`;
    if (repo.head) await repo.commit([{ path: VAULT_FILE, content: json }], 'Snowlog: create vault');
    else await repo.createFirstFile(VAULT_FILE, json, 'Snowlog: create vault');
    const vault = new Vault(repo, dek);
    await vault.createNote('Welcome', WELCOME);
    return { vault, vaultFile, recoveryCode };
  }

  async loadIndex() {
    let text;
    try {
      text = await this.repo.readText(INDEX_FILE);
      this.offline = false;
      if (text && this.store) await this.store.put('index', { content: text });
    } catch (e) {
      // Offline: the last known index (with the changes made here while offline).
      const hit = isNetworkError(e) && this.store && await this.store.get('index');
      if (!hit) throw e;
      text = hit.content;
      this.offline = true;
    }
    await this.loadOutbox();
    if (text) {
      try {
        this.index = JSON.parse(await C.decryptText(this.dek, text, 'index'));
      } catch {
        // The key was rotated on another device: unlock again with the passphrase.
        throw new Error('key_changed');
      }
    }
    if (!this.index.folders) this.index.folders = [];
    // What another device changed is read again from the repository (the version here is no longer the latest).
    for (const id of [...this.cache.keys()]) {
      if (this.index.notes[id]?.updated !== this.base.get(id)) this.cache.delete(id);
    }
    for (const id of [...this.fileCache.keys()]) {
      if (this.fileBase.has(id) && this.versionOf(id) !== this.fileBase.get(id)) this.fileCache.delete(id);
    }
    if (!this.index.files) this.index.files = {};
  }

  // Stores the just-uploaded encrypted files in the local cache (or removes them if they were deleted).
  async cacheChanges(changes) {
    if (!this.store) return;
    for (const c of changes) {
      const m = c.path.match(/^[na]\/([^/]+)\.enc$/);
      if (!m) continue;
      if (c.delete) await this.store.delete(c.path);
      else await this.store.put(c.path, { v: this.versionOf(m[1]), content: c.content });
    }
  }

  // A file's version according to the index: if it matches the cache's, the cache is valid.
  versionOf(id) {
    return this.index.notes[id]?.updated || this.index.files?.[id]?.updated || this.index.files?.[id]?.created || null;
  }

  // Reads an encrypted file: from the cache if it is up to date, otherwise from the repository (and caches it).
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

  // Downloads in one go the notes that are neither in memory nor in the local cache (for the full index).
  // With GraphQL it takes 10 requests for 1,000 notes instead of 1,000. If it fails, no harm done:
  // read() will fetch them one by one.
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
      } catch { /* read() will fetch it */ }
    }
    return n;
  }

  async indexChange() {
    return { path: INDEX_FILE, content: await C.encryptText(this.dek, JSON.stringify(this.index), 'index') };
  }

  // Applies a change to the index (and files) in a single commit. If another device
  // wrote first, it reloads the index, repeats the change and retries once.
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

  // A free name: "Untitled", "Untitled 1"…
  freePath(folder, name = 'Untitled') {
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
      // A damaged or tampered local copy does not decrypt: it is fetched again from the repository.
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
      'Snowlog: new note',
      (idx) => {
        idx.notes[id] = { path: p, created: now, updated: now };
        this.addFolderChain(idx, parentPath(p));
      },
      async () => [{ path: notePath(id), content: await C.encryptText(this.dek, text, id) }],
    );
    this.remember(id, text);
    return id;
  }

  // Imports many notes at once, in batches (one commit per batch).
  // items: [{ path, text }]. If a name already exists, it adds “ (imported)”, “ (imported 2)”…
  // Returns [{ id, path }] in the order received.
  async importNotes(items, { batchSize = 100, onProgress, message = 'importar', folders = [] } = {}) {
    const taken = new Set(this.notes().map((n) => n.path.toLowerCase()));
    const planned = items.map(({ path, text }) => {
      let p = normalizePath(path);
      validName(p);
      if (taken.has(p.toLowerCase())) {
        let n = 1;
        const base = p;
        do {
          p = `${base} (imported${n > 1 ? ` ${n}` : ''})`;
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
        `Snowlog: ${message} (${batch.length} notes)`,
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

  // Saves several notes in a single commit: [{ id, text }].
  async saveMany(items, message = 'update links') {
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

  // Saves the note. If another device changed it since it was read here, nothing is lost:
  // this version stays in the note and the other one is saved as a copy beside it.
  // Returns { conflict: { id, path } } when the copy was needed.
  async saveNote(id, text) {
    if (this.offline) return this.queue(id, text);
    try {
      return await this.saveOnline(id, text);
    } catch (e) {
      if (e.message === 'key_changed') {
        // The key was rotated on another device: what was written is kept here to upload after unlocking.
        await this.queue(id, text);
        throw e;
      }
      if (e.message !== 'offline') throw e;
      return this.queue(id, text);
    }
  }

  // --- Offline ---
  // Keeps the change here (memory and encrypted cache) to upload it with sync().
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
    // It may be encrypted with an earlier key (if it was rotated on another device while there were
    // pending changes here): the keyring is tried too so they are not lost.
    try {
      this.outbox = new Map(JSON.parse(await C.decryptText(this.dek, hit.content, 'outbox')));
      return;
    } catch { /* maybe from before the rotation */ }
    for (const key of await this.loadKeyring(true).catch(() => [])) {
      try {
        this.outbox = new Map(JSON.parse(await C.decryptText(key, hit.content, 'outbox')));
        await this.saveOutbox();
        return;
      } catch { /* siguiente */ }
    }
  }

  // The vault's earlier keys (CryptoKey), newest first.
  // Only exists if the key was ever rotated (the index says so); `force` looks for it anyway.
  async loadKeyring(force = false) {
    if (this.keyring) return this.keyring;
    if (!force && !this.index.hasKeyring) return [];
    let text = null;
    try {
      text = await this.repo.readText(KEYRING_FILE);
    } catch {
      return [];
    }
    if (!text) {
      this.keyring = [];
      return this.keyring;
    }
    const list = JSON.parse(await C.decryptText(this.dek, text, 'keyring'));
    this.keyring = await Promise.all(list.map((k) => C.importKey(k.key)));
    this.keyringRaw = list;
    return this.keyring;
  }

  // Rotates the key: everything (notes, attachments, index) is encrypted again with a new DEK in a single
  // commit. The old DEK goes to the keyring, encrypted with the new one, to be able to read the history.
  // Returns { vaultFile, recoveryCode }. Nobody else should write while it runs.
  async rotate(vaultFile, passphrase, iterations, onProgress = () => {}) {
    if (this.offline) throw new Error('offline');
    if (this.outbox.size) throw new Error('pending');
    await this.repo.fetchHead();
    await this.loadIndex();
    await this.loadKeyring();
    const { vault: next, dek, recoveryCode, oldKey } = await C.rotateVault(vaultFile, passphrase, iterations);
    const notes = this.notes();
    const files = this.files();
    const total = notes.length + files.length;
    let done = 0;
    await this.prefetch(notes.map((n) => n.id));
    const changes = [];
    for (const n of notes) {
      changes.push({ path: notePath(n.id), content: await C.encryptText(dek, await this.read(n.id), n.id) });
      onProgress(++done, total);
    }
    for (const f of files) {
      changes.push({ path: filePath(f.id), content: C.toB64(await C.encryptBytes(dek, await this.readFile(f.id), f.id)) });
      onProgress(++done, total);
    }
    const ring = [{ key: oldKey, until: next.rotated }, ...(this.keyringRaw || [])];
    this.index.hasKeyring = true;
    changes.push({ path: KEYRING_FILE, content: await C.encryptText(dek, JSON.stringify(ring), 'keyring') });
    changes.push({ path: INDEX_FILE, content: await C.encryptText(dek, JSON.stringify(this.index), 'index') });
    changes.push({ path: VAULT_FILE, content: `${JSON.stringify(next, null, 2)}\n` });
    try {
      await this.repo.commit(changes, 'Snowlog: rotate the key', { blobs: true });
    } catch (e) {
      if (e.status === 409) throw new Error('busy');
      if (isNetworkError(e)) throw new Error('offline');
      throw e;
    }
    const old = this.dek;
    this.dek = dek;
    this.keyring = [old, ...(this.keyring || [])];
    this.keyringRaw = ring;
    if (this.store) {
      await this.store.clear();
      for (const c of changes) {
        const m = c.path.match(/^[na]\/([^/]+)\.enc$/);
        if (m) await this.store.put(c.path, { v: this.versionOf(m[1]), content: c.content });
      }
      await this.store.put('index', { content: changes.find((c) => c.path === INDEX_FILE).content });
    }
    return { vaultFile: next, recoveryCode };
  }

  // Reconnects (reloads the index) and uploads what is pending. Each note is saved as a normal save, detecting
  // conflicts against the version there was before going offline.
  // Returns { synced, conflicts: [{ id, path }] }. If the network fails again, it throws 'offline'.
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
      'Snowlog: save note',
      (idx) => {
        const now = new Date().toISOString();
        if (!idx.notes[id]) {
          // It was deleted on another device: it is restored with this version.
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
            // First it tries to combine both changes; if they clash, the other version goes to a copy.
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

  // Like freePath, but on a given index (the one reloaded inside apply).
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
    // A note created offline is not in the repository yet: it is only renamed here.
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
    await this.apply('Snowlog: rename note', (idx) => {
      if (!idx.notes[id]) throw new Error('missing');
      idx.notes[id].path = p;
      this.addFolderChain(idx, parentPath(p));
    });
  }

  async deleteNote(id) {
    await this.apply(
      'Snowlog: delete note',
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
    await this.apply('Snowlog: new folder', (idx) => this.addFolderChain(idx, p));
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
    await this.apply('Snowlog: rename folder', (idx) => {
      idx.folders = idx.folders.map(moved);
      for (const n of Object.values(idx.notes)) n.path = moved(n.path);
      for (const f of Object.values(idx.files || {})) f.path = moved(f.path);
      this.addFolderChain(idx, to);
    });
  }

  // --- Vault settings (encrypted inside the index, so they are shared between devices) ---
  getSettings() {
    return { ...(this.index.settings || {}) };
  }

  async saveSettings(settings) {
    await this.apply('Snowlog: settings', (idx) => { idx.settings = { ...settings }; });
  }

  // --- Historial ---
  // Versions of a note, newest first: [{ ref, date }].
  // The first is the current one. Git keeps each encrypted version; here they are only listed.
  async history(id) {
    return (await this.repo.history(notePath(id))).map((c) => ({ ref: c.sha, date: c.date }));
  }

  async readVersion(id, ref) {
    const text = await this.repo.readText(notePath(id), ref);
    if (!text) return '';
    try {
      return await C.decryptText(this.dek, text, id);
    } catch (e) {
      // A version from before the key rotation: it opens with the key of that time (from the keyring).
      for (const key of await this.loadKeyring()) {
        try {
          return await C.decryptText(key, text, id);
        } catch { /* siguiente */ }
      }
      throw e;
    }
  }

  // --- Adjuntos ---
  files() {
    return Object.entries(this.index.files || {}).map(([id, f]) => ({ id, ...f }));
  }

  // ![[photo.png]] or ![[Folder/photo.png]]: first the exact path, then the name.
  findFile(name) {
    const t = normalizePath(name).toLowerCase();
    const all = this.files();
    return all.find((f) => f.path.toLowerCase() === t) || all.find((f) => baseName(f.path).toLowerCase() === baseName(t)) || null;
  }

  // A free name for an attachment: "photo.png", "photo 1.png"…
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

  // Stores an encrypted attachment. Returns { id, path } (the name may change if it already existed).
  async addFile(folder, name, bytes) {
    const clean = name.replace(/[\\/:*?"<>|#^[\]]/g, '-').trim() || 'adjunto';
    this.checkAttachment(clean, bytes);
    const path = this.freeFilePath(normalizePath(folder), clean);
    validName(path);
    const id = C.randomId();
    const now = new Date().toISOString();
    const content = C.toB64(await C.encryptBytes(this.dek, bytes, id));
    await this.apply(`Snowlog: add attachment`, (idx) => {
      if (!idx.files) idx.files = {};
      idx.files[id] = { path, type: ATTACHMENT_TYPES[extOf(path)], size: bytes.length, created: now };
      this.addFolderChain(idx, parentPath(path));
    }, async () => [{ path: filePath(id), content }]);
    this.fileCache.set(id, bytes);
    this.fileBase.set(id, this.versionOf(id));
    this.fileBaseBytes.set(id, bytes);
    return { id, path };
  }

  async readFile(id) {
    if (this.fileCache.has(id)) return this.fileCache.get(id);
    const { content: b64 } = await this.readEncrypted(filePath(id), id);
    if (b64 == null) throw new Error('missing');
    const bytes = await C.decryptBytes(this.dek, C.fromB64(b64.trim()), id);
    this.fileCache.set(id, bytes);
    this.fileBase.set(id, this.versionOf(id));
    this.fileBaseBytes.set(id, bytes);
    return bytes;
  }

  // Saves a new version of an attachment (a drawing). If it changed on another device since it was
  // read here, `merge(base, mine, theirs)` can combine both versions ({ bytes, conflict }); if it
  // cannot, or they clash, the other version is saved as a copy beside it.
  // Devuelve { merged?: bytes guardados, conflict?: { id, path } }.
  async saveFile(id, bytes, { merge = null } = {}) {
    const meta = this.index.files?.[id];
    if (!meta) throw new Error('missing');
    this.checkAttachment(meta.path, bytes);
    const mine = { ...meta };
    let conflict = null;
    let out = bytes;
    await this.apply('Snowlog: save drawing', (idx) => {
      const now = new Date().toISOString();
      if (!idx.files[id]) idx.files[id] = { ...mine };
      idx.files[id].updated = now;
      idx.files[id].size = out.length;
      if (conflict) {
        const name = baseName(idx.files[id].path);
        const ext = extOf(name);
        conflict.path = this.freeFilePath(parentPath(idx.files[id].path), `${conflictName(name.slice(0, -(ext.length + 1)))}.${ext}`);
        idx.files[conflict.id] = { path: conflict.path, type: idx.files[id].type, size: conflict.bytes.length, created: now };
      }
    }, async () => {
      conflict = null;
      out = bytes;
      const changes = [];
      const remote = this.index.files?.[id];
      const base = this.fileBase.get(id);
      if (remote && base !== undefined && (remote.updated || remote.created) !== base) {
        const theirs = await this.repo.readText(filePath(id));
        if (theirs) {
          const plain = await C.decryptBytes(this.dek, C.fromB64(theirs.trim()), id);
          if (!sameBytes(plain, bytes)) {
            const baseBytes = this.fileBaseBytes.get(id);
            let joined = null;
            try {
              joined = merge && baseBytes ? merge(baseBytes, bytes, plain) : null;
            } catch { /* could not combine: copy */ }
            if (joined?.bytes) out = joined.bytes;
            if (!joined?.bytes || joined.conflict) {
              conflict = { id: C.randomId(), bytes: plain };
              changes.push({ path: filePath(conflict.id), content: C.toB64(await C.encryptBytes(this.dek, plain, conflict.id)) });
            }
          }
        }
      }
      this.checkAttachment(meta.path, out);
      changes.unshift({ path: filePath(id), content: C.toB64(await C.encryptBytes(this.dek, out, id)) });
      return changes;
    });
    this.fileCache.set(id, out);
    this.fileBase.set(id, this.versionOf(id));
    this.fileBaseBytes.set(id, out);
    const res = out !== bytes ? { merged: out } : {};
    if (!conflict) return res;
    this.fileCache.set(conflict.id, conflict.bytes);
    this.fileBase.set(conflict.id, this.versionOf(conflict.id));
    this.fileBaseBytes.set(conflict.id, conflict.bytes);
    return { ...res, conflict: { id: conflict.id, path: conflict.path } };
  }

  async deleteFile(id) {
    await this.apply('Snowlog: eliminar adjunto', (idx) => { delete idx.files[id]; }, async () => [{ path: filePath(id), delete: true }]);
    this.fileCache.delete(id);
  }

  notesUnder(folder) {
    return this.notes().filter((n) => n.path.startsWith(`${folder}/`));
  }

  // Deletes the folder, its subfolders and all their notes.
  async deleteFolder(folder) {
    const f = normalizePath(folder);
    const ids = this.notesUnder(f).map((n) => n.id);
    const fids = this.files().filter((x) => x.path.startsWith(`${f}/`)).map((x) => x.id);
    await this.apply(
      'Snowlog: delete folder',
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

  // Stores an updated vault.json in the repository (after recovering with the code).
  async writeVaultFile(vaultFile, message = 'change passphrase') {
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
