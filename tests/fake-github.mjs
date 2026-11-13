// GitHub falso en memoria para probar la bóveda sin red.
// Implementa solo los endpoints que usa js/github.js.

export function createFakeGitHub({ owner = 'u', repo = 'notes' } = {}) {
  const commits = new Map(); // sha -> { parent, files: Map }
  const trees = new Map(); // sha -> Map
  let head = null;
  let n = 0;
  const sha = (p) => `${p}${(n += 1).toString(16).padStart(8, '0')}`;
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  let clock = Date.UTC(2026, 10, 1);
  function commitFiles(files, parent) {
    const s = sha('c');
    commits.set(s, { parent, files, date: new Date(clock += 60000).toISOString() });
    return s;
  }

  async function fetchImpl(url, opts = {}) {
    const u = new URL(url);
    const method = opts.method || 'GET';
    if (!u.href.startsWith(base)) return json(404, { message: 'Not Found' });
    const path = decodeURIComponent(u.pathname.slice(new URL(base).pathname.length));
    const body = opts.body ? JSON.parse(opts.body) : null;

    if (path === '' && method === 'GET') return json(200, { full_name: `${owner}/${repo}`, private: true });
    if (path === '/git/ref/heads/main') return head ? json(200, { object: { sha: head } }) : json(409, { message: 'Git Repository is empty.' });
    if (path.startsWith('/contents/') && method === 'GET') {
      const c = commits.get(u.searchParams.get('ref') || head);
      const file = c?.files.get(path.slice('/contents/'.length));
      return file == null ? json(404, { message: 'Not Found' }) : new Response(file, { status: 200 });
    }
    if (path.startsWith('/contents/') && method === 'PUT') {
      const files = new Map(head ? commits.get(head).files : []);
      files.set(path.slice('/contents/'.length), decodeURIComponent(escape(atob(body.content))));
      head = commitFiles(files, head);
      return json(201, { commit: { sha: head } });
    }
    if (path === '/commits' && method === 'GET') {
      const file = u.searchParams.get('path');
      const out = [];
      for (let s = u.searchParams.get('sha') || head; s; s = commits.get(s).parent) {
        const c = commits.get(s);
        const before = c.parent ? commits.get(c.parent).files.get(file) : undefined;
        if (c.files.get(file) !== before) out.push({ sha: s, commit: { committer: { date: c.date } } });
      }
      const per = Number(u.searchParams.get('per_page') || 30);
      const page = Number(u.searchParams.get('page') || 1);
      return json(200, out.slice((page - 1) * per, page * per));
    }
    if (path.startsWith('/git/commits/') && method === 'GET') {
      const s = path.slice('/git/commits/'.length);
      if (!commits.has(s)) return json(404, { message: 'Not Found' });
      const t = sha('t');
      trees.set(t, commits.get(s).files);
      return json(200, { sha: s, tree: { sha: t } });
    }
    if (path === '/git/trees' && method === 'POST') {
      const files = new Map(trees.get(body.base_tree));
      for (const e of body.tree) {
        if (e.sha === null) files.delete(e.path);
        else files.set(e.path, e.content);
      }
      const t = sha('t');
      trees.set(t, files);
      return json(201, { sha: t });
    }
    if (path === '/git/commits' && method === 'POST') {
      return json(201, { sha: commitFiles(trees.get(body.tree), body.parents[0]) });
    }
    if (path === '/git/refs/heads/main' && method === 'PATCH') {
      if (commits.get(body.sha).parent !== head) return json(422, { message: 'Update is not a fast forward' });
      head = body.sha;
      return json(200, { object: { sha: head } });
    }
    return json(404, { message: `Not implemented: ${method} ${path}` });
  }

  return {
    fetch: fetchImpl,
    files: () => new Map(head ? commits.get(head).files : []),
    commitCount: () => commits.size,
    // Simula que otro dispositivo escribe un fichero.
    externalWrite(path, content) {
      const files = new Map(commits.get(head).files);
      files.set(path, content);
      head = commitFiles(files, head);
    },
  };
}
