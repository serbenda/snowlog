// Minimal client of the GitHub REST API for a single repository.
// Every save is ONE atomic commit (Git Data API), with several files if needed.

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export class GitHubRepo {
  // getToken: async function that returns the current token.
  // onUnauthorized: async function that tries to refresh the token; returns true if it succeeds.
  constructor({ owner, repo, branch }, getToken, onUnauthorized) {
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.getToken = getToken;
    this.onUnauthorized = onUnauthorized;
    this.head = null; // sha of the last known commit
  }

  get base() {
    return `${API}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
  }

  async request(method, path, { body, accept = 'application/vnd.github+json', retry = true, graphql = false } = {}) {
    const token = await this.getToken();
    const res = await fetch(graphql ? `${API}/graphql` : `${this.base}${path}`, {
      method,
      cache: 'no-store',
      headers: {
        Accept: accept,
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && retry && this.onUnauthorized && (await this.onUnauthorized())) {
      return this.request(method, path, { body, accept, retry: false, graphql });
    }
    if (!res.ok) {
      let msg = res.statusText;
      try {
        msg = (await res.json()).message || msg;
      } catch { /* no body */ }
      throw new GitHubError(res.status, msg);
    }
    if (accept.includes('raw')) return res.text();
    if (res.status === 204) return null;
    return res.json();
  }

  // Checks that the token can see the repository. Returns the repository data.
  async check() {
    return this.request('GET', '');
  }

  // sha of the branch's last commit, or null if the repository is empty.
  async fetchHead() {
    try {
      const ref = await this.request('GET', `/git/ref/heads/${encodeURIComponent(this.branch)}`);
      this.head = ref.object.sha;
    } catch (e) {
      if (e.status === 404 || e.status === 409) this.head = null;
      else throw e;
    }
    return this.head;
  }

  // Reads a text file at the current commit (or at `ref`). Returns null if it does not exist.
  async readText(path, ref) {
    if (!ref && !this.head) await this.fetchHead();
    const at = ref || this.head;
    if (!at) return null;
    try {
      return await this.request('GET', `/contents/${encodePath(path)}?ref=${encodeURIComponent(at)}`, {
        accept: 'application/vnd.github.raw+json',
      });
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  // Reads many text files at once (GraphQL, up to 100 per request).
  // Returns Map(path → text | null). If GraphQL is not available, it throws and the caller reads one by one.
  async readMany(paths, ref) {
    if (!ref && !this.head) await this.fetchHead();
    const at = ref || this.head;
    const out = new Map();
    if (!at) return out;
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const fields = chunk.map((p, j) => `f${j}: object(expression: ${JSON.stringify(`${at}:${p}`)}) { ... on Blob { text isTruncated } }`).join('\n');
      const query = `query($o: String!, $r: String!) { repository(owner: $o, name: $r) {\n${fields}\n} }`;
      const res = await this.request('POST', '', { body: { query, variables: { o: this.owner, r: this.repo } }, graphql: true });
      if (res.errors?.length && !res.data) throw new GitHubError(400, res.errors[0].message);
      chunk.forEach((p, j) => {
        const blob = res.data?.repository?.[`f${j}`];
        out.set(p, blob && !blob.isTruncated && typeof blob.text === 'string' ? blob.text : null);
      });
    }
    return out;
  }

  // Commits that changed a file, newest first: [{ sha, date }].
  async history(path, { perPage = 50, page = 1 } = {}) {
    if (!this.head) await this.fetchHead();
    if (!this.head) return [];
    const list = await this.request('GET', `/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(this.head)}&per_page=${perPage}&page=${page}`);
    return list.map((c) => ({ sha: c.sha, date: c.commit?.committer?.date || c.commit?.author?.date || '' }));
  }

  // First commit of an empty repository.
  async createFirstFile(path, text, message) {
    const res = await this.request('PUT', `/contents/${encodePath(path)}`, {
      body: { message, content: btoa(unescape(encodeURIComponent(text))), branch: this.branch },
    });
    this.head = res.commit.sha;
  }

  // changes: [{ path, content }] to create or change, [{ path, delete: true }] to delete.
  // Throws GitHubError(409) if someone wrote first (not a fast-forward).
  // blobs: true uploads each file separately first (for very large commits, such as rotating the key).
  async commit(changes, message, { blobs = false } = {}) {
    if (!this.head) await this.fetchHead();
    const parent = await this.request('GET', `/git/commits/${this.head}`);
    const shas = new Map();
    if (blobs) {
      const todo = changes.filter((c) => !c.delete);
      let i = 0;
      const worker = async () => {
        while (i < todo.length) {
          const c = todo[i++];
          const res = await this.request('POST', '/git/blobs', { body: { content: c.content, encoding: 'utf-8' } });
          shas.set(c.path, res.sha);
        }
      };
      await Promise.all(Array.from({ length: 8 }, worker));
    }
    const tree = await this.request('POST', '/git/trees', {
      body: {
        base_tree: parent.tree.sha,
        tree: changes.map((c) => {
          if (c.delete) return { path: c.path, mode: '100644', type: 'blob', sha: null };
          if (shas.has(c.path)) return { path: c.path, mode: '100644', type: 'blob', sha: shas.get(c.path) };
          return { path: c.path, mode: '100644', type: 'blob', content: c.content };
        }),
      },
    });
    const commit = await this.request('POST', '/git/commits', {
      body: { message, tree: tree.sha, parents: [this.head] },
    });
    try {
      await this.request('PATCH', `/git/refs/heads/${encodeURIComponent(this.branch)}`, {
        body: { sha: commit.sha, force: false },
      });
    } catch (e) {
      if (e.status === 422) throw new GitHubError(409, 'conflict');
      throw e;
    }
    this.head = commit.sha;
    return commit.sha;
  }
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}
