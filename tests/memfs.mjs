// Sistema de ficheros en memoria con la forma de FileSystemDirectoryHandle (lo justo para los tests).

class MemFile {
  constructor(name, data = new Uint8Array(), mtime = Date.now()) {
    this.kind = 'file';
    this.name = name;
    this.data = data;
    this.mtime = mtime;
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
      write: async (d) => { chunks.push(typeof d === 'string' ? new TextEncoder().encode(d) : new Uint8Array(d)); },
      close: async () => {
        const len = chunks.reduce((a, c) => a + c.length, 0);
        const out = new Uint8Array(len);
        let p = 0;
        for (const c of chunks) { out.set(c, p); p += c.length; }
        this.data = out;
        this.mtime = Date.now();
      },
    };
  }
}

export class MemDir {
  constructor(name = 'raíz') {
    this.kind = 'directory';
    this.name = name;
    this.children = new Map();
  }

  async* entries() { yield* [...this.children.entries()]; }

  async getDirectoryHandle(name, { create = false } = {}) {
    const h = this.children.get(name);
    if (h && h.kind === 'directory') return h;
    if (h || !create) throw Object.assign(new Error(`NotFound: ${name}`), { name: 'NotFoundError' });
    const d = new MemDir(name);
    this.children.set(name, d);
    return d;
  }

  async getFileHandle(name, { create = false } = {}) {
    const h = this.children.get(name);
    if (h && h.kind === 'file') return h;
    if (h || !create) throw Object.assign(new Error(`NotFound: ${name}`), { name: 'NotFoundError' });
    const f = new MemFile(name);
    this.children.set(name, f);
    return f;
  }

  async removeEntry(name, { recursive = false } = {}) {
    const h = this.children.get(name);
    if (!h) throw new Error(`NotFound: ${name}`);
    if (h.kind === 'directory' && h.children.size && !recursive) throw new Error('InvalidModificationError');
    this.children.delete(name);
  }

  // Ayudas para los tests
  put(path, text) {
    const parts = path.split('/');
    let d = this;
    for (const p of parts.slice(0, -1)) {
      if (!d.children.has(p)) d.children.set(p, new MemDir(p));
      d = d.children.get(p);
    }
    d.children.set(parts.at(-1), new MemFile(parts.at(-1), typeof text === 'string' ? new TextEncoder().encode(text) : text, Date.UTC(2026, 10, 1)));
  }

  list(prefix = '') {
    const out = [];
    for (const [name, h] of this.children) {
      const p = prefix ? `${prefix}/${name}` : name;
      if (h.kind === 'directory') out.push(`${p}/`, ...h.list(p));
      else out.push(p);
    }
    return out.sort();
  }

  text(path) {
    let d = this;
    const parts = path.split('/');
    for (const p of parts.slice(0, -1)) d = d.children.get(p);
    return new TextDecoder().decode(d.children.get(parts.at(-1)).data);
  }
}
