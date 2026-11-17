// Notes repository on a local clone, with the same interface as GitHubRepo (js/github.js), so
// Vault (js/vault.js) works in Node unchanged.
//
// - It reads the encrypted files from the remote branch (`origin/main` after a `git fetch`), never from
//   the working tree: anything half-done in the clone does not get mixed into the vault.
// - Each change is a commit made with git plumbing (a temporary index, `write-tree`, `commit-tree`)
//   and pushed with `git push <sha>:main`. It does not touch the clone's working tree or index.
// - If the push is rejected because another device wrote first, it throws the same 409 as GitHubRepo:
//   Vault reloads the index and repeats (and merges the note if needed).
// - Offline, it throws TypeError, which Vault understands as "offline".

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

// Runs git and returns stdout. `input` goes through stdin. Secrets are never passed as arguments.
export function git(dir, args, { input, env } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn('git', ['-C', dir, ...args], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C', ...env },
      stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
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
        const e = new GitError(code, stderr.trim() || `git ${args[0]} failed (${code})`);
        e.stderr = stderr;
        reject(e);
      }
    });
    if (p.stdin) {
      // If git exits before reading all of stdin, writing to it fails with EPIPE: the exit code
      // (handled above) is what matters, so that error is ignored instead of crashing the process.
      p.stdin.on('error', () => {});
      p.stdin.end(input);
    }
  });
}

// Turns git's network failures into TypeError (what fetch throws when offline).
function networkAware(e) {
  if (NETWORK_RE.test(e.stderr || e.message)) {
    const t = new TypeError('offline');
    t.cause = e;
    return t;
  }
  return e;
}

export class GitDirRepo {
  // dir: the clone's folder. remote: name of the remote (null = work only with the local branch, for tests).
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

  // sha of the remote branch's last commit (after fetching it), or null if it is empty.
  async fetchHead() {
    if (this.remote) {
      try {
        await this.git(['fetch', '--quiet', this.remote, `+refs/heads/${this.branch}:${this.ref}`]);
      } catch (e) {
        const n = networkAware(e);
        if (n instanceof TypeError) throw n;
        // Empty remote: the branch does not exist yet.
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

  // Reads many files with a single process (`git cat-file --batch`). Map(path → text | null).
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
      p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new GitError(code, 'cat-file failed'))));
      p.stdin.end(paths.map((x) => `${at}:${x}\n`).join(''));
    });
    let pos = 0;
    for (const path of paths) {
      const nl = raw.indexOf(10, pos);
      const header = raw.subarray(pos, nl).toString('utf8');
      pos = nl + 1;
      const m = header.match(/^[0-9a-f]+ (\w+) (\d+)$/);
      if (!m) {
        out.set(path, null); // "missing"
        continue;
      }
      const size = Number(m[2]);
      out.set(path, m[1] === 'blob' ? raw.subarray(pos, pos + size).toString('utf8') : null);
      pos += size + 1;
    }
    return out;
  }

  // Commits that changed a file, newest first: [{ sha, date }].
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

  // changes: [{ path, content }] or [{ path, delete: true }]. One commit; 409 if not a fast-forward.
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

  // Pushes the commit. With a remote: a push without forcing. Without one: moves the local branch only if nobody moved it.
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

  // If the clone is on that branch, clean and with no commits of its own ahead, advances it (like a pull).
  // Otherwise it is left as it is: it will catch up with your next `git pull`.
  async syncLocalBranch(sha) {
    if (!this.remote) return;
    try {
      const cur = (await this.git(['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim();
      if (cur !== this.branch) return;
      if ((await this.git(['status', '--porcelain', '--untracked-files=no'])).trim()) return;
      await this.git(['merge', '--ff-only', '--quiet', sha]);
    } catch { /* clone out of date, diverged or empty: left alone */ }
  }
}
