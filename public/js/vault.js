// La bóveda: índice cifrado + notas cifradas en el repo privado.
//
// Estructura en el repo de notas:
//   .snowlog/vault.json   parámetros públicos y la clave de datos envuelta (sin secretos en claro)
//   .snowlog/index.enc    índice cifrado: rutas y fechas de las notas, carpetas
//   n/<id>.enc            una nota cifrada; <id> es aleatorio y no revela el título

import * as C from './crypto.js';

export const VAULT_FILE = '.snowlog/vault.json';
export const INDEX_FILE = '.snowlog/index.enc';
const notePath = (id) => `n/${id}.enc`;

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

function validName(path) {
  if (!path) throw new Error('empty_name');
  if (path.length > 300) throw new Error('name_too_long');
  if (/[\\:*?"<>|#^[\]]/.test(path)) throw new Error('bad_chars');
}

export class Vault {
  constructor(repo, dek) {
    this.repo = repo;
    this.dek = dek;
    this.index = { v: 1, notes: {}, folders: [] };
    this.cache = new Map();
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
    const text = await this.repo.readText(INDEX_FILE);
    if (text) this.index = JSON.parse(await C.decryptText(this.dek, text, 'index'));
    if (!this.index.folders) this.index.folders = [];
  }

  async indexChange() {
    return { path: INDEX_FILE, content: await C.encryptText(this.dek, JSON.stringify(this.index), 'index') };
  }

  // Aplica un cambio al índice (y ficheros) en un solo commit. Si otro dispositivo
  // escribió antes, recarga el índice, repite el cambio y reintenta una vez.
  async apply(message, mutate, files = async () => []) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const snapshot = structuredClone(this.index);
      try {
        const fileChanges = await files();
        const result = mutate(this.index);
        await this.repo.commit([...fileChanges, await this.indexChange()], message);
        return result;
      } catch (e) {
        this.index = snapshot;
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
    const text = await this.repo.readText(notePath(id));
    const plain = text ? await C.decryptText(this.dek, text, id) : '';
    this.cache.set(id, plain);
    return plain;
  }

  async createNote(path, text = '') {
    const p = normalizePath(path);
    validName(p);
    this.ensureFree(p);
    const id = C.randomId();
    const now = new Date().toISOString();
    await this.apply(
      'Snowlog: nueva nota',
      (idx) => {
        idx.notes[id] = { path: p, created: now, updated: now };
        this.addFolderChain(idx, parentPath(p));
      },
      async () => [{ path: notePath(id), content: await C.encryptText(this.dek, text, id) }],
    );
    this.cache.set(id, text);
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
      for (const n of batch) this.cache.set(n.id, n.text);
      if (onProgress) onProgress(Math.min(i + batchSize, planned.length), planned.length);
    }
    return planned.map(({ id, path }) => ({ id, path }));
  }

  async saveNote(id, text) {
    await this.apply(
      'Snowlog: guardar nota',
      (idx) => {
        if (idx.notes[id]) idx.notes[id].updated = new Date().toISOString();
      },
      async () => [{ path: notePath(id), content: await C.encryptText(this.dek, text, id) }],
    );
    this.cache.set(id, text);
  }

  async renameNote(id, newPath) {
    const p = normalizePath(newPath);
    validName(p);
    this.ensureFree(p, id);
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
      this.addFolderChain(idx, to);
    });
  }

  notesUnder(folder) {
    return this.notes().filter((n) => n.path.startsWith(`${folder}/`));
  }

  // Borra la carpeta, sus subcarpetas y todas sus notas.
  async deleteFolder(folder) {
    const f = normalizePath(folder);
    const ids = this.notesUnder(f).map((n) => n.id);
    await this.apply(
      'Snowlog: eliminar carpeta',
      (idx) => {
        idx.folders = idx.folders.filter((x) => x !== f && !x.startsWith(`${f}/`));
        for (const id of ids) delete idx.notes[id];
      },
      async () => ids.map((id) => ({ path: notePath(id), delete: true })),
    );
    for (const id of ids) this.cache.delete(id);
  }

  // Guarda en el repo un vault.json actualizado (tras recuperar con el código).
  async writeVaultFile(vaultFile) {
    await this.repo.commit([{ path: VAULT_FILE, content: `${JSON.stringify(vaultFile, null, 2)}\n` }], 'Snowlog: cambiar frase de paso');
  }
}
