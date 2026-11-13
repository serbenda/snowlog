// Carpeta "de mentira" guardada dentro del navegador, para la versión portátil en Firefox y Safari
// (que no dejan elegir carpetas del disco ni usar el almacenamiento de ficheros abiertos con file://).
// Imita lo justo de FileSystemDirectoryHandle para que LocalVault funcione igual que con una carpeta.
// Cada cambio se guarda enseguida en IndexedDB o, si no hay, en localStorage.

const notFound = (name) => Object.assign(new Error(`No existe: ${name}`), { name: 'NotFoundError' });

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

class KvFile {
  constructor(name, data, mtime, onChange) {
    this.kind = 'file';
    this.name = name;
    this.data = data;
    this.mtime = mtime;
    this.onChange = onChange;
  }

  async getFile() {
    const { data, mtime } = this;
    return {
      size: data.length,
      lastModified: mtime,
      text: async () => new TextDecoder().decode(data),
      arrayBuffer: async () => data.slice().buffer,
    };
  }

  async createWritable() {
    const chunks = [];
    return {
      write: async (d) => {
        if (typeof d === 'string') chunks.push(new TextEncoder().encode(d));
        else if (d instanceof ArrayBuffer) chunks.push(new Uint8Array(d));
        else chunks.push(new Uint8Array(d.buffer ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d));
      },
      close: async () => {
        const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
        let p = 0;
        for (const c of chunks) { out.set(c, p); p += c.length; }
        this.data = out;
        this.mtime = Math.max(Date.now(), this.mtime + 1);
        await this.onChange();
      },
    };
  }
}

class KvDir {
  constructor(name, onChange) {
    this.kind = 'directory';
    this.name = name;
    this.children = new Map();
    this.onChange = onChange;
  }

  async* entries() { yield* [...this.children.entries()]; }

  async getDirectoryHandle(name, { create = false } = {}) {
    const h = this.children.get(name);
    if (h?.kind === 'directory') return h;
    if (h || !create) throw notFound(name);
    const d = new KvDir(name, this.onChange);
    this.children.set(name, d);
    await this.onChange();
    return d;
  }

  async getFileHandle(name, { create = false } = {}) {
    const h = this.children.get(name);
    if (h?.kind === 'file') return h;
    if (h || !create) throw notFound(name);
    const f = new KvFile(name, new Uint8Array(), Date.now(), this.onChange);
    this.children.set(name, f);
    return f;
  }

  async removeEntry(name, { recursive = false } = {}) {
    const h = this.children.get(name);
    if (!h) throw notFound(name);
    if (h.kind === 'directory' && h.children.size && !recursive) throw Object.assign(new Error('No está vacía'), { name: 'InvalidModificationError' });
    this.children.delete(name);
    await this.onChange();
  }
}

// Todo el árbol como lista plana: [{ p: 'Carpeta/nota.md', d: base64, m: mtime }] y carpetas vacías ({ p, dir: true }).
function flatten(dir, prefix = '', out = []) {
  for (const [name, h] of dir.children) {
    const p = prefix ? `${prefix}/${name}` : name;
    if (h.kind === 'directory') {
      if (!h.children.size) out.push({ p, dir: true });
      flatten(h, p, out);
    } else {
      out.push({ p, d: toB64(h.data), m: h.mtime });
    }
  }
  return out;
}

// backend: { load(): Promise<lista|null>, save(lista): Promise }. Devuelve la carpeta raíz.
export async function openKvDir(backend, name = 'este navegador') {
  let saving = Promise.resolve();
  let pending = false;
  const root = new KvDir(name, () => {
    // Varios cambios seguidos se guardan juntos, pero sin esperar: nada queda solo en memoria.
    if (pending) return saving;
    pending = true;
    saving = saving.then(() => {
      pending = false;
      return backend.save(flatten(root));
    });
    return saving;
  });
  const list = (await backend.load()) || [];
  for (const e of list) {
    const parts = e.p.split('/');
    let d = root;
    for (const part of e.dir ? parts : parts.slice(0, -1)) {
      if (!d.children.has(part)) d.children.set(part, new KvDir(part, root.onChange));
      d = d.children.get(part);
    }
    if (!e.dir) d.children.set(parts.at(-1), new KvFile(parts.at(-1), fromB64(e.d), e.m || 0, root.onChange));
  }
  root.flush = () => saving;
  return root;
}

// Dónde guardar: IndexedDB si el navegador lo deja, si no localStorage. null si ninguno.
export async function browserBackend(key = 'snowlog-portable') {
  try {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open(key, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const run = (mode, fn) => new Promise((resolve, reject) => {
      const req = fn(db.transaction('kv', mode).objectStore('kv'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await run('readwrite', (st) => st.put(1, '__prueba'));
    return { kind: 'idb', load: () => run('readonly', (st) => st.get('files')), save: (list) => run('readwrite', (st) => st.put(list, 'files')) };
  } catch { /* sin IndexedDB: se prueba localStorage */ }
  try {
    localStorage.setItem('__snowlog_prueba', '1');
    localStorage.removeItem('__snowlog_prueba');
    return {
      kind: 'localStorage',
      load: async () => JSON.parse(localStorage.getItem(key) || 'null'),
      save: async (list) => localStorage.setItem(key, JSON.stringify(list)),
    };
  } catch {
    return null;
  }
}

export function memoryBackend(initial = null) {
  let data = initial;
  return { kind: 'memory', load: async () => data, save: async (list) => { data = structuredClone(list); }, peek: () => data };
}
