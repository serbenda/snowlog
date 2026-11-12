// Índice en memoria de todas las notas descifradas: frontmatter, etiquetas, tareas y enlaces.
// Vive solo en memoria y se borra al bloquear. Lo usan las consultas, los enlaces entrantes
// y el calendario.

import { parseFrontmatter } from './markdown.js';

const TAG_RE = /(^|[\s(])#([\p{L}_][\p{L}\p{N}_/-]*)/gu;
const LINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
// Una tarea: "- [ ] texto", también dentro de citas o callouts ("> - [x] …").
export const TASK_LINE_RE = /^(\s*(?:>\s*)*[-*+]\s+\[)([ xX])(\]\s*)(.*)$/;
const DAY_RE = /^(\d{4}-\d{2}-\d{2})$/;

function asList(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  return String(v).split(/[\s,]+/).filter(Boolean);
}

// Recorre las líneas fuera de bloques de código y del frontmatter.
export function contentLines(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const start = parseFrontmatter(text).lines;
  const out = [];
  let fence = null;
  for (let i = start; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(?:>\s*)*(```|~~~)/);
    if (m) {
      fence = fence === m[1] ? null : (fence || m[1]);
      continue;
    }
    if (!fence) out.push({ line: i, value: lines[i] });
  }
  return out;
}

export function parseNote({ id, path, text = '', created, updated }) {
  const parts = path.split('/');
  const name = parts[parts.length - 1];
  const folder = parts.slice(0, -1).join('/');
  const fm = parseFrontmatter(text).data || {};
  const tags = new Set(asList(fm.tags ?? fm.tag).map((t) => String(t).replace(/^#/, '').toLowerCase()));
  const tasks = [];
  const links = new Set();
  for (const { line, value } of contentLines(text)) {
    const plain = value.replace(/`[^`]*`/g, ''); // lo que va en `código` no cuenta
    for (const m of plain.matchAll(TAG_RE)) tags.add(m[2].toLowerCase());
    for (const m of plain.matchAll(LINK_RE)) links.add(m[1].trim().toLowerCase());
    const t = value.match(TASK_LINE_RE);
    if (t) {
      // Una tarea vacía (o solo con etiquetas, como la de una plantilla) no es una tarea real.
      const empty = !t[4].replace(TAG_RE, '$1').trim();
      tasks.push({ line, text: t[4], completed: t[2] !== ' ', empty });
    }
  }
  const day = (name.match(DAY_RE) || [])[1] || null;
  return { id, path, name, folder, fm, tags, tasks, links, text, ctime: created || '', mtime: updated || '', day };
}

// Cambia el estado de la tarea de la línea indicada. Devuelve el texto nuevo o null.
export function toggleTaskLine(text, line, done) {
  const lines = text.split('\n');
  const m = lines[line] != null && lines[line].replace(/\r$/, '').match(TASK_LINE_RE);
  if (!m) return null;
  const mark = done == null ? (m[2] === ' ' ? 'x' : ' ') : (done ? 'x' : ' ');
  lines[line] = `${m[1]}${mark}${m[3]}${m[4]}`;
  return lines.join('\n');
}

// ¿Enlaza la nota `from` a la nota `target`? Acepta [[Título]] y [[Carpeta/Título]].
export function linksTo(from, target) {
  return from.links.has(target.name.toLowerCase()) || from.links.has(target.path.toLowerCase());
}
