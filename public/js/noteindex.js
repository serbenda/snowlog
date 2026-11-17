// In-memory index of every decrypted note: frontmatter, tags, tasks and links.
// It lives only in memory and is wiped on lock. Queries, backlinks and the calendar
// use it.

import { parseFrontmatter } from './markdown.js';

const TAG_RE = /(^|[\s(])#([\p{L}_][\p{L}\p{N}_/-]*)/gu;
const LINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
// A task: "- [ ] text", also inside quotes or callouts ("> - [x] …").
export const TASK_LINE_RE = /^(\s*(?:>\s*)*[-*+]\s+\[)([ xX])(\]\s*)(.*)$/;
const DAY_RE = /^(\d{4}-\d{2}-\d{2})$/;

function asList(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  return String(v).split(/[\s,]+/).filter(Boolean);
}

// Walks the lines outside code blocks and the frontmatter.
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
    const plain = value.replace(/`[^`]*`/g, ''); // what is inside `code` does not count
    for (const m of plain.matchAll(TAG_RE)) tags.add(m[2].toLowerCase());
    for (const m of plain.matchAll(LINK_RE)) links.add(m[1].trim().toLowerCase());
    const t = value.match(TASK_LINE_RE);
    if (t) {
      // An empty task (or one with only tags, like a template's) is not a real task.
      const empty = !t[4].replace(TAG_RE, '$1').trim();
      tasks.push({ line, text: t[4], completed: t[2] !== ' ', empty });
    }
  }
  const day = (name.match(DAY_RE) || [])[1] || null;
  return { id, path, name, folder, fm, tags, tasks, links, text, ctime: created || '', mtime: updated || '', day };
}

// Toggles the task on the given line. Returns the new text, or null.
export function toggleTaskLine(text, line, done) {
  const lines = text.split('\n');
  const m = lines[line] != null && lines[line].replace(/\r$/, '').match(TASK_LINE_RE);
  if (!m) return null;
  const mark = done == null ? (m[2] === ' ' ? 'x' : ' ') : (done ? 'x' : ' ');
  lines[line] = `${m[1]}${mark}${m[3]}${m[4]}`;
  return lines.join('\n');
}

// Does note `from` link to note `target`? Accepts [[Title]] and [[Folder/Title]].
export function linksTo(from, target) {
  return from.links.has(target.name.toLowerCase()) || from.links.has(target.path.toLowerCase());
}
