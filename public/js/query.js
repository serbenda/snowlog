// Consultas al estilo Dataview, con el subconjunto que se usa en el día a día:
//
//   TASK  [FROM "carpeta" | FROM #etiqueta] [WHERE …] [GROUP BY …] [SORT … ASC|DESC] [LIMIT n]
//   LIST  [FROM …] [WHERE …] [SORT …] [LIMIT n]
//   TABLE campo1, campo2 AS "Título" [FROM …] [WHERE …] [SORT …] [LIMIT n]
//
// WHERE admite AND, OR, NOT/!, paréntesis, = != < > <= >=, y las funciones
// contains, icontains, startswith, endswith, lower, upper, length, date, default.
// Campos: text y completed (en TASK), file.name, file.path, file.folder, file.link,
// file.tags, file.day, file.ctime, file.mtime, y cualquier propiedad del frontmatter.

import { escapeHtml, inline } from './markdown.js';

export class QueryError extends Error {}

// ---------------------------------------------------------------------------
// Análisis

const KEYWORDS = ['FROM', 'WHERE', 'GROUP', 'SORT', 'LIMIT', 'FLATTEN'];

function tokenize(src) {
  const tokens = [];
  const re = /\s+|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(-?\d+(?:\.\d+)?)|(#[\p{L}\p{N}_/-]+)|(!=|<=|>=|=|<|>|!|\(|\)|,)|([\p{L}_][\p{L}\p{N}_.-]*)/uy;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m || m.index !== pos) throw new QueryError(`No entiendo «${src.slice(pos, pos + 12)}»`);
    pos = re.lastIndex;
    if (m[1]) tokens.push({ t: 'str', v: m[1].slice(1, -1).replace(/\\(.)/g, '$1') });
    else if (m[2]) tokens.push({ t: 'num', v: Number(m[2]) });
    else if (m[3]) tokens.push({ t: 'tag', v: m[3].slice(1).toLowerCase() });
    else if (m[4]) tokens.push({ t: 'op', v: m[4] });
    else if (m[5]) tokens.push({ t: 'id', v: m[5] });
  }
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.i = 0;
  }

  peek() { return this.tokens[this.i]; }

  isKw(word) {
    const t = this.peek();
    return t && t.t === 'id' && t.v.toUpperCase() === word;
  }

  atClause() {
    const t = this.peek();
    return !t || (t.t === 'id' && KEYWORDS.includes(t.v.toUpperCase()));
  }

  next() { return this.tokens[this.i++]; }

  expect(test, what) {
    const t = this.next();
    if (!t || !test(t)) throw new QueryError(`Esperaba ${what}${t ? ` y encontré «${t.v}»` : ' al final'}`);
    return t;
  }

  expr() { return this.or(); }

  or() {
    let left = this.and();
    while (this.isKw('OR')) {
      this.next();
      left = { k: 'or', a: left, b: this.and() };
    }
    return left;
  }

  and() {
    let left = this.not();
    while (this.isKw('AND')) {
      this.next();
      left = { k: 'and', a: left, b: this.not() };
    }
    return left;
  }

  not() {
    const t = this.peek();
    if ((t && t.t === 'op' && t.v === '!') || this.isKw('NOT')) {
      this.next();
      return { k: 'not', a: this.not() };
    }
    return this.cmp();
  }

  cmp() {
    const left = this.primary();
    const t = this.peek();
    if (t && t.t === 'op' && ['=', '!=', '<', '>', '<=', '>='].includes(t.v)) {
      this.next();
      return { k: 'cmp', op: t.v, a: left, b: this.primary() };
    }
    return left;
  }

  primary() {
    const t = this.next();
    if (!t) throw new QueryError('La condición está incompleta');
    if (t.t === 'str' || t.t === 'num') return { k: 'lit', v: t.v };
    if (t.t === 'tag') return { k: 'lit', v: `#${t.v}` };
    if (t.t === 'op' && t.v === '(') {
      const e = this.expr();
      this.expect((x) => x.t === 'op' && x.v === ')', '«)»');
      return e;
    }
    if (t.t === 'id') {
      const low = t.v.toLowerCase();
      if (low === 'true' || low === 'false') return { k: 'lit', v: low === 'true' };
      if (low === 'null') return { k: 'lit', v: null };
      const p = this.peek();
      if (p && p.t === 'op' && p.v === '(') {
        this.next();
        const args = [];
        if (!(this.peek() && this.peek().t === 'op' && this.peek().v === ')')) {
          for (;;) {
            args.push(this.expr());
            const sep = this.next();
            if (sep && sep.t === 'op' && sep.v === ')') break;
            if (!sep || sep.v !== ',') throw new QueryError(`Falta «)» en ${t.v}(…)`);
          }
        } else {
          this.next();
        }
        return { k: 'fn', name: low, args };
      }
      return { k: 'field', name: t.v };
    }
    throw new QueryError(`No esperaba «${t.v}»`);
  }
}

export function parseQuery(src) {
  const p = new Parser(tokenize(src));
  const head = p.expect((t) => t.t === 'id', 'TASK, LIST o TABLE').v.toUpperCase();
  if (!['TASK', 'LIST', 'TABLE'].includes(head)) throw new QueryError(`Tipo de consulta desconocido: ${head}. Usa TASK, LIST o TABLE`);
  const q = { type: head, columns: [], from: [], where: [], groupBy: null, sort: [], limit: null };

  if (head === 'TABLE') {
    if (p.isKw('WITHOUT')) {
      p.next();
      p.expect((t) => t.t === 'id' && t.v.toUpperCase() === 'ID', 'ID');
      q.withoutId = true;
    }
    while (!p.atClause()) {
      const e = p.expr();
      let label = e.k === 'field' ? e.name : 'valor';
      if (p.isKw('AS')) {
        p.next();
        label = p.expect((t) => t.t === 'str' || t.t === 'id', 'un nombre de columna').v;
      }
      q.columns.push({ expr: e, label });
      if (p.peek() && p.peek().t === 'op' && p.peek().v === ',') p.next();
    }
  }

  while (p.peek()) {
    const kw = p.expect((t) => t.t === 'id', 'FROM, WHERE, GROUP BY, SORT o LIMIT').v.toUpperCase();
    if (kw === 'FROM') {
      for (;;) {
        const neg = Boolean(p.peek() && p.peek().t === 'op' && p.peek().v === '!');
        if (neg) p.next();
        const s = p.next();
        if (!s || (s.t !== 'str' && s.t !== 'tag')) throw new QueryError('FROM necesita "carpeta" o #etiqueta');
        q.from.push({ kind: s.t === 'tag' ? 'tag' : 'folder', value: s.v.replace(/^\/+|\/+$/g, ''), neg });
        if (p.isKw('OR') || p.isKw('AND')) q.fromOp = p.next().v.toUpperCase();
        else break;
      }
    } else if (kw === 'WHERE') {
      q.where.push(p.expr());
    } else if (kw === 'GROUP') {
      p.expect((t) => t.t === 'id' && t.v.toUpperCase() === 'BY', 'BY');
      q.groupBy = p.expr();
    } else if (kw === 'SORT') {
      for (;;) {
        const e = p.expr();
        let dir = 1;
        if (p.isKw('ASC') || p.isKw('ASCENDING')) p.next();
        else if (p.isKw('DESC') || p.isKw('DESCENDING')) {
          p.next();
          dir = -1;
        }
        q.sort.push({ expr: e, dir });
        if (p.peek() && p.peek().t === 'op' && p.peek().v === ',') p.next();
        else break;
      }
    } else if (kw === 'LIMIT') {
      q.limit = p.expect((t) => t.t === 'num', 'un número').v;
    } else {
      throw new QueryError(`${kw} no está soportado`);
    }
  }
  return q;
}

// ---------------------------------------------------------------------------
// Evaluación

const pad = (n) => String(n).padStart(2, '0');
function isoDay(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function getField(ctx, name) {
  const { note, task } = ctx;
  const low = name.toLowerCase();
  if (task) {
    if (low === 'text') return task.text;
    if (low === 'completed' || low === 'checked') return task.completed;
    if (low === 'line') return task.line;
  }
  switch (low) {
    case 'file.name': return note.name;
    case 'file.path': return note.path;
    case 'file.folder': return note.folder;
    case 'file.link': return { link: note };
    case 'file.tags': case 'tags': case 'file.etags': return [...note.tags].map((t) => `#${t}`);
    case 'file.day': return note.day;
    case 'file.ctime': case 'file.cday': return note.ctime;
    case 'file.mtime': case 'file.mday': return note.mtime;
    case 'file.tasks': return note.tasks.length;
    default: break;
  }
  const key = Object.keys(note.fm).find((k) => k.toLowerCase() === low);
  return key ? note.fm[key] : null;
}

// Ojo: los strings tienen un método heredado .link(), así que se comprueba que sea un objeto.
const isLink = (v) => v != null && typeof v === 'object' && !Array.isArray(v) && 'link' in v;
const str = (v) => (v == null ? '' : isLink(v) ? v.link.name : String(v));

function compare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' || typeof b === 'boolean') return Number(a) - Number(b);
  return str(a).localeCompare(str(b), 'es', { numeric: true, sensitivity: 'base' });
}

function equals(a, b) {
  if (Array.isArray(a)) return a.some((x) => equals(x, b));
  if (a == null || b == null) return a == b; // eslint-disable-line eqeqeq
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
  return str(a).toLowerCase() === str(b).toLowerCase();
}

function containsFn(a, b, insensitive) {
  if (a == null) return false;
  if (Array.isArray(a)) return a.some((x) => (insensitive ? str(x).toLowerCase() === str(b).toLowerCase() : str(x) === str(b)));
  const hay = str(a);
  return insensitive ? hay.toLowerCase().includes(str(b).toLowerCase()) : hay.includes(str(b));
}

function evalExpr(e, ctx) {
  switch (e.k) {
    case 'lit': return e.v;
    case 'field': return getField(ctx, e.name);
    case 'not': return !truthy(evalExpr(e.a, ctx));
    case 'and': return truthy(evalExpr(e.a, ctx)) && truthy(evalExpr(e.b, ctx));
    case 'or': return truthy(evalExpr(e.a, ctx)) || truthy(evalExpr(e.b, ctx));
    case 'cmp': {
      const a = evalExpr(e.a, ctx);
      const b = evalExpr(e.b, ctx);
      if (e.op === '=') return equals(a, b);
      if (e.op === '!=') return !equals(a, b);
      if (a == null || b == null) return false;
      const c = compare(a, b);
      return e.op === '<' ? c < 0 : e.op === '>' ? c > 0 : e.op === '<=' ? c <= 0 : c >= 0;
    }
    case 'fn': {
      const args = e.args.map((x) => evalExpr(x, ctx));
      switch (e.name) {
        case 'contains': return containsFn(args[0], args[1], false);
        case 'icontains': return containsFn(args[0], args[1], true);
        case 'startswith': return str(args[0]).startsWith(str(args[1]));
        case 'endswith': return str(args[0]).endsWith(str(args[1]));
        case 'lower': return str(args[0]).toLowerCase();
        case 'upper': return str(args[0]).toUpperCase();
        case 'length': return Array.isArray(args[0]) ? args[0].length : str(args[0]).length;
        case 'default': return args[0] == null || args[0] === '' ? args[1] : args[0];
        case 'date': {
          const raw = e.args[0] && e.args[0].k === 'field' ? e.args[0].name.toLowerCase() : str(args[0]).toLowerCase();
          const now = ctx.now ? new Date(ctx.now) : new Date();
          if (raw === 'today' || raw === 'hoy') return isoDay(now);
          if (raw === 'tomorrow' || raw === 'mañana') return isoDay(new Date(now.getTime() + 864e5));
          if (raw === 'yesterday' || raw === 'ayer') return isoDay(new Date(now.getTime() - 864e5));
          return str(args[0]).slice(0, 10);
        }
        default: throw new QueryError(`Función desconocida: ${e.name}()`);
      }
    }
    default: return null;
  }
}

function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

function inSource(note, from, op = 'OR') {
  if (!from.length) return true;
  return from[op === 'AND' ? 'every' : 'some']((s) => {
    const hit = s.kind === 'tag'
      ? [...note.tags].some((t) => t === s.value || t.startsWith(`${s.value}/`))
      : (s.value === '' || note.path === s.value || note.path.startsWith(`${s.value}/`));
    return s.neg ? !hit : hit;
  });
}

// notes: salida de parseNote. opts.exclude: carpetas que no se consultan (plantillas).
export function runQuery(q, notes, { exclude = [], now } = {}) {
  const pool = notes.filter((n) => inSource(n, q.from, q.fromOp)
    && !exclude.some((f) => f && (n.path.startsWith(`${f}/`) || n.path === f)));
  const pass = (ctx) => q.where.every((w) => truthy(evalExpr(w, ctx)));
  const sortRows = (rows, ctxOf) => {
    if (!q.sort.length) return rows;
    return rows.slice().sort((x, y) => {
      for (const s of q.sort) {
        const c = compare(evalExpr(s.expr, ctxOf(x)), evalExpr(s.expr, ctxOf(y)));
        if (c) return c * s.dir;
      }
      return 0;
    });
  };

  if (q.type === 'TASK') {
    let rows = [];
    for (const note of pool) {
      for (const task of note.tasks) {
        if (task.empty) continue;
        const ctx = { note, task, now };
        if (pass(ctx)) rows.push({ note, task });
      }
    }
    rows = sortRows(rows, (r) => ({ note: r.note, task: r.task, now }));
    if (q.limit != null) rows = rows.slice(0, q.limit);
    const groups = new Map();
    for (const r of rows) {
      const key = q.groupBy ? str(evalExpr(q.groupBy, { note: r.note, task: r.task, now })) : r.note.path;
      if (!groups.has(key)) groups.set(key, { key, note: r.note, tasks: [] });
      groups.get(key).tasks.push(r.task);
    }
    const list = [...groups.values()];
    if (!q.sort.length) list.sort((a, b) => a.note.path.localeCompare(b.note.path, 'es'));
    return { type: 'TASK', groups: list, count: rows.length };
  }

  let rows = pool.filter((note) => pass({ note, now }));
  if (q.sort.length) rows = sortRows(rows, (n) => ({ note: n, now }));
  else rows.sort((a, b) => a.path.localeCompare(b.path, 'es'));
  if (q.limit != null) rows = rows.slice(0, q.limit);
  if (q.type === 'LIST') return { type: 'LIST', notes: rows, count: rows.length };
  return {
    type: 'TABLE',
    headers: q.columns.map((c) => c.label),
    withoutId: Boolean(q.withoutId),
    rows: rows.map((note) => ({ note, values: q.columns.map((c) => evalExpr(c.expr, { note, now })) })),
    count: rows.length,
  };
}

// ---------------------------------------------------------------------------
// Presentación (HTML seguro: todo pasa por escapeHtml o inline)

const noteLink = (note) => `<a class="internal-link" href="#" data-target="${escapeHtml(note.path)}">${escapeHtml(note.name)}</a>`;

function cell(v) {
  if (v == null || v === '') return '<span class="empty-value">—</span>';
  if (isLink(v)) return noteLink(v.link);
  if (Array.isArray(v)) return v.map(cell).join(', ');
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  return inline(String(v));
}

export function renderResult(res) {
  if (res.type === 'TASK') {
    if (!res.groups.length) return '<p class="query-empty">Sin tareas.</p>';
    return res.groups.map((g) => `<div class="query-group"><div class="query-group-title">${noteLink(g.note)}</div><ul class="query-tasks">${
      g.tasks.map((t) => `<li class="task${t.completed ? ' done' : ''}"><input type="checkbox" class="task-checkbox" data-note="${escapeHtml(g.note.id)}" data-line="${t.line}"${t.completed ? ' checked' : ''} aria-label="Marcar tarea"><span class="task-text">${inline(t.text)}</span></li>`).join('')
    }</ul></div>`).join('');
  }
  if (res.type === 'LIST') {
    if (!res.notes.length) return '<p class="query-empty">Sin resultados.</p>';
    return `<ul class="query-list">${res.notes.map((n) => `<li>${noteLink(n)}</li>`).join('')}</ul>`;
  }
  if (!res.rows.length) return '<p class="query-empty">Sin resultados.</p>';
  const head = `${res.withoutId ? '' : '<th>Nota</th>'}${res.headers.map((hd) => `<th>${escapeHtml(hd)}</th>`).join('')}`;
  const body = res.rows.map((r) => `<tr>${res.withoutId ? '' : `<td>${noteLink(r.note)}</td>`}${r.values.map((v) => `<td>${cell(v)}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
