// Búsqueda de texto completo sobre el índice en memoria (notas ya descifradas).
// Sin distinguir mayúsculas ni acentos. Sintaxis:
//   palabras            todas deben aparecer en la nota (en el texto o en el nombre)
//   "frase exacta"      entre comillas
//   -palabra            la nota no debe contenerla
//   tag:#proyecto       la nota tiene esa etiqueta (o una hija: proyecto/web)
//   path:Diario         la ruta de la nota contiene ese texto

// Pliega a minúsculas sin acentos manteniendo la longitud, para que las posiciones
// encontradas en el texto plegado sirvan también en el original.
export function fold(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const code = c.charCodeAt(0);
    if (code < 128) out += code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : c;
    else if (code >= 0xd800 && code <= 0xdfff) out += c;
    else {
      const f = c.normalize('NFD')[0].toLowerCase();
      out += f.length === 1 ? f : c;
    }
  }
  return out;
}

export function parseSearch(input) {
  const q = { terms: [], not: [], tags: [], paths: [] };
  const re = /(-?)(?:(tag|path|file):)?(?:"([^"]*)"?|(\S+))/gi;
  for (const m of String(input).matchAll(re)) {
    const neg = m[1] === '-';
    const op = (m[2] || '').toLowerCase();
    const value = fold((m[3] ?? m[4] ?? '').trim());
    if (!value) continue;
    if (op === 'tag') q.tags.push({ neg, tag: value.replace(/^#/, '') });
    else if (op) q.paths.push({ neg, path: value });
    else (neg ? q.not : q.terms).push(value);
  }
  return q;
}

export const isEmptySearch = (q) => !q.terms.length && !q.not.length && !q.tags.length && !q.paths.length;

// Texto plegado de cada nota; se recalcula solo si la nota cambia (parseNote crea otro objeto).
const folded = new WeakMap();
function foldedOf(note) {
  let f = folded.get(note);
  if (!f) {
    f = { text: fold(note.text || ''), path: fold(note.path) };
    folded.set(note, f);
  }
  return f;
}

const hasTag = (note, tag) => [...note.tags].some((t) => t === tag || t.startsWith(`${tag}/`));

// Fragmento de una línea alrededor de lo encontrado, con las posiciones para resaltar.
function snippet(line, ranges, width = 140) {
  let from = 0;
  if (line.length > width) from = Math.max(0, Math.min(ranges[0][0] - 40, line.length - width));
  const to = Math.min(line.length, from + width);
  const text = (from ? '…' : '') + line.slice(from, to) + (to < line.length ? '…' : '');
  const shift = (from ? 1 : 0) - from;
  const marks = ranges
    .filter(([a, b]) => a >= from && b <= to)
    .map(([a, b]) => [a + shift, b + shift]);
  return { text, marks };
}

// Devuelve [{ note, score, matches: [{ line, text, marks }], count }] ordenado por relevancia.
export function searchNotes(notes, input, { limit = 200, perNote = 3 } = {}) {
  const q = typeof input === 'string' ? parseSearch(input) : input;
  if (isEmptySearch(q)) return [];
  const results = [];
  for (const note of notes) {
    const f = foldedOf(note);
    const hay = `${f.path}\n${f.text}`;
    if (q.not.some((t) => hay.includes(t))) continue;
    if (!q.tags.every(({ neg, tag }) => hasTag(note, tag) !== neg)) continue;
    if (!q.paths.every(({ neg, path }) => f.path.includes(path) !== neg)) continue;
    if (!q.terms.every((t) => hay.includes(t))) continue;
    const name = fold(note.name);
    let score = 0;
    for (const t of q.terms) if (name.includes(t)) score += name === t ? 100 : name.startsWith(t) ? 50 : 20;
    const matches = [];
    let count = 0;
    if (q.terms.length) {
      const lines = f.text.split('\n');
      let offset = 0;
      for (let i = 0; i < lines.length; i++) {
        const fl = lines[i];
        const ranges = [];
        for (const t of q.terms) {
          for (let at = fl.indexOf(t); at !== -1; at = fl.indexOf(t, at + t.length)) ranges.push([at, at + t.length]);
        }
        if (ranges.length) {
          count += ranges.length;
          if (matches.length < perNote) {
            ranges.sort((a, b) => a[0] - b[0]);
            const original = note.text.slice(offset, offset + fl.length);
            matches.push({ line: i, offset: offset + ranges[0][0], length: ranges[0][1] - ranges[0][0], ...snippet(original, ranges) });
          }
        }
        offset += fl.length + 1;
      }
    }
    score += Math.min(count, 20);
    results.push({ note, score, matches, count });
  }
  results.sort((a, b) => b.score - a.score || (b.note.mtime || '').localeCompare(a.note.mtime || ''));
  return results.slice(0, limit);
}

// Etiquetas con el número de notas que las usan, de más a menos usadas.
export function tagCounts(notes) {
  const counts = new Map();
  for (const n of notes) for (const t of n.tags) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'es'));
}
