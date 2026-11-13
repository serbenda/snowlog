// Repo de notas sobre un clon local, con la misma interfaz que GitHubRepo (js/github.js), para que
// Vault (js/vault.js) funcione en Node sin cambios.
//
// - Lee los ficheros cifrados de la rama remota (`origin/main` tras un `git fetch`), nunca del árbol
//   de trabajo: lo que tengas a medias en el clon no se mezcla con la bóveda.
// - Cada cambio es un commit hecho con plomería de git (índice temporal, `write-tree`, `commit-tree`)
//   y subido con `git push <sha>:main`. No toca el árbol de trabajo ni el índice del clon.
// - Si el push se rechaza porque otro dispositivo escribió antes, lanza el mismo 409 que GitHubRepo:
//   Vault recarga el índice y repite (y fusiona la nota si hace falta).
// - Sin red lanza TypeError, que Vault entiende como «sin conexión».

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export class GitError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const NETWORK_RE = /could not resolve host|unable to access|could not read from remote|connection (refused|timed out|reset)|network is unreachable|operation timed out/i;
const REJECTED_RE = /\[rejected\]|non-fast-forward|fetch first|updates were rejected|failed to update ref|stale info/i;

// Ejecuta git y devuelve stdout. `input` va por stdin. Nunca se pasan secretos por argumentos.
export function git(dir, args, { input, env } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn('git', ['-C', dir, ...args], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C', ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const out = [];
    const err = [];
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => err.push(d));
    p.on('error', reject);
    p.on('close', (code) => {
      const stdout = Buffer.concat(out).toString('utf8');
      const stderr = Buffer.concat(err).toString('utf8');
      if (code === 0) resolve(stdout);
      else {
        const e = new GitError(code, stderr.trim() || `git ${args[0]} falló (${code})`);
        e.stderr = stderr;
        reject(e);
      }
    });
    p.stdin.end(input ?? '');
  });
}

// Convierte los fallos de red de git en TypeError (lo que lanza fetch sin conexión).
function networkAware(e) {
  if (NETWORK_RE.test(e.stderr || e.message)) {
    const t = new TypeError('offline');
    t.cause = e;
    return t;
  }
  return e;
}

export class GitDirRepo {
  // dir: carpeta del clon. remote: nombre del remoto (null = trabajar solo con la rama local, para tests).
  constructor({ dir, remote = 'origin', branch = 'main' }) {
    this.dir = dir;
    this.remote = remote;
    this.branch = branch;
    this.head = null;
  }

  get ref() {
    return this.remote ? `refs/remotes/${this.remote}/${this.branch}` : `refs/heads/${this.branch}`;
  }

  git(args, opts) {
    return git(this.dir, args, opts);
  }

  // sha del último commit de la rama remota (tras traerla), o null si está vacía.
  async fetchHead() {
    if (this.remote) {
      try {
        await this.git(['fetch', '--quiet', this.remote, `+refs/heads/${this.branch}:${this.ref}`]);
      } catch (e) {
        const n = networkAware(e);
        if (n instanceof TypeError) throw n;
        // Remoto vacío: la rama aún no existe.
        if (!/couldn't find remote ref|could not find remote ref/i.test(e.stderr || '')) throw e;
      }
    }
    try {
      this.head = (await this.git(['rev-parse', '--verify', '--quiet', `${this.ref}^{commit}`])).trim() || null;
    } catch {
      this.head = null;
    }
    return this.head;
  }

  async readText(path, ref) {
    if (!ref && !this.head) await this.fetchHead();
    const at = ref || this.head;
    if (!at) return null;
    const map = await this.readMany([path], at);
    return map.get(path) ?? null;
  }

  // Lee muchos ficheros con un solo proceso (`git cat-file --batch`). Map(path → texto | null).
  async readMany(paths, ref) {
    if (!ref && !this.head) await this.fetchHead();
    const at = ref || this.head;
    const out = new Map();
    if (!at || !paths.length) return out;
    const raw = await new Promise((resolve, reject) => {
      const p = spawn('git', ['-C', this.dir, 'cat-file', '--batch'], { stdio: ['pipe', 'pipe', 'pipe'] });
      const chunks = [];
      p.stdout.on('data', (d) => chunks.push(d));
      p.on('error', reject);
      p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new GitError(code, 'cat-file falló'))));
      p.stdin.end(paths.map((x) => `${at}:${x}\n`).join(''));
    });
    let pos = 0;
    for (const path of paths) {
      const nl = raw.indexOf(10, pos);
      const header = raw.subarray(pos, nl).toString('utf8');
      pos = nl + 1;
      const m = header.match(/^[0-9a-f]+ (\w+) (\d+)$/);
      if (!m) {
        out.set(path, null); // «missing»
        continue;
      }
      const size = Number(m[2]);
      out.set(path, m[1] === 'blob' ? raw.subarray(pos, pos + size).toString('utf8') : null);
      pos += size + 1;
    }
    return out;
  }

  // Commits que cambiaron un fichero, del más reciente al más antiguo: [{ sha, date }].
  async history(path, { perPage = 50, page = 1 } = {}) {
    if (!this.head) await this.fetchHead();
    if (!this.head) return [];
    const text = await this.git(['log', `--max-count=${perPage}`, `--skip=${(page - 1) * perPage}`, '--format=%H %cI', this.head, '--', path]);
    return text.trim().split('\n').filter(Boolean).map((l) => {
      const [sha, date] = l.split(' ');
      return { sha, date };
    });
  }

  async createFirstFile(path, text, message) {
    await this.writeCommit([{ path, content: text }], message, null);
  }

  // changes: [{ path, content }] o [{ path, delete: true }]. Un commit; 409 si no es avance rápido.
  async commit(changes, message) {
    if (!this.head) await this.fetchHead();
    return this.writeCommit(changes, message, this.head);
  }

  async writeCommit(changes, message, parent) {
    const tmp = await mkdtemp(join(tmpdir(), 'snowlog-idx-'));
    const env = { GIT_INDEX_FILE: join(tmp, 'index') };
    let sha;
    try {
      if (parent) await this.git(['read-tree', parent], { env });
      else await this.git(['read-tree', '--empty'], { env });
      for (const c of changes) {
        if (c.delete) {
          await this.git(['update-index', '--force-remove', '--', c.path], { env });
          continue;
        }
        const blob = (await this.git(['hash-object', '-w', '--stdin'], { input: c.content })).trim();
        await this.git(['update-index', '--add', '--cacheinfo', `100644,${blob},${c.path}`], { env });
      }
      const tree = (await this.git(['write-tree'], { env })).trim();
      const args = ['commit-tree', tree, '-F', '-'];
      if (parent) args.push('-p', parent);
      sha = (await this.git(args, { input: message })).trim();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
    await this.publish(sha, parent);
    this.head = sha;
    await this.syncLocalBranch(sha);
    return sha;
  }

  // Sube el commit. Con remoto: push sin forzar. Sin remoto: mueve la rama local solo si nadie la movió.
  async publish(sha, parent) {
    if (!this.remote) {
      try {
        await this.git(['update-ref', `refs/heads/${this.branch}`, sha, parent || '0'.repeat(40)]);
      } catch {
        throw new GitError(409, 'conflict');
      }
      return;
    }
    try {
      await this.git(['push', '--quiet', this.remote, `${sha}:refs/heads/${this.branch}`]);
    } catch (e) {
      if (REJECTED_RE.test(e.stderr || '')) throw new GitError(409, 'conflict');
      throw networkAware(e);
    }
    await this.git(['update-ref', this.ref, sha]);
  }

  // Si el clon está en esa rama, limpio y sin commits propios por delante, lo avanza (como un pull).
  // Si no, lo deja como está: se pondrá al día con tu próximo `git pull`.
  async syncLocalBranch(sha) {
    if (!this.remote) return;
    try {
      const cur = (await this.git(['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim();
      if (cur !== this.branch) return;
      if ((await this.git(['status', '--porcelain', '--untracked-files=no'])).trim()) return;
      await this.git(['merge', '--ff-only', '--quiet', sha]);
    } catch { /* clon desfasado, divergente o vacío: no se toca */ }
  }
}
