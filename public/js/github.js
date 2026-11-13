// Cliente mínimo de la API REST de GitHub para un único repo.
// Cada guardado es UN commit atómico (Git Data API), con varios ficheros si hace falta.

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export class GitHubRepo {
  // getToken: función async que devuelve el token vigente.
  // onUnauthorized: función async que intenta renovar el token; devuelve true si lo logra.
  constructor({ owner, repo, branch }, getToken, onUnauthorized) {
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.getToken = getToken;
    this.onUnauthorized = onUnauthorized;
    this.head = null; // sha del último commit conocido
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
      } catch { /* sin cuerpo */ }
      throw new GitHubError(res.status, msg);
    }
    if (accept.includes('raw')) return res.text();
    if (res.status === 204) return null;
    return res.json();
  }

  // Comprueba que el token ve el repo. Devuelve los datos del repo.
  async check() {
    return this.request('GET', '');
  }

  // sha del último commit de la rama, o null si el repo está vacío.
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

  // Lee un fichero de texto en el commit actual (o en `ref`). Devuelve null si no existe.
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

  // Lee muchos ficheros de texto de una vez (GraphQL, hasta 100 por petición).
  // Devuelve Map(path → texto | null). Si GraphQL no está disponible, lanza y el que llama lee uno a uno.
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

  // Commits que cambiaron un fichero, del más reciente al más antiguo: [{ sha, date }].
  async history(path, { perPage = 50, page = 1 } = {}) {
    if (!this.head) await this.fetchHead();
    if (!this.head) return [];
    const list = await this.request('GET', `/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(this.head)}&per_page=${perPage}&page=${page}`);
    return list.map((c) => ({ sha: c.sha, date: c.commit?.committer?.date || c.commit?.author?.date || '' }));
  }

  // Primer commit de un repo vacío.
  async createFirstFile(path, text, message) {
    const res = await this.request('PUT', `/contents/${encodePath(path)}`, {
      body: { message, content: btoa(unescape(encodeURIComponent(text))), branch: this.branch },
    });
    this.head = res.commit.sha;
  }

  // changes: [{ path, content }] para crear o cambiar, [{ path, delete: true }] para borrar.
  // Lanza GitHubError(409) si alguien ha escrito antes (no es avance rápido).
  async commit(changes, message) {
    if (!this.head) await this.fetchHead();
    const parent = await this.request('GET', `/git/commits/${this.head}`);
    const tree = await this.request('POST', '/git/trees', {
      body: {
        base_tree: parent.tree.sha,
        tree: changes.map((c) => (c.delete
          ? { path: c.path, mode: '100644', type: 'blob', sha: null }
          : { path: c.path, mode: '100644', type: 'blob', content: c.content })),
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
