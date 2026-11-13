// Ayudas del editor: funciones puras sobre (texto, selección) que devuelven una edición.
// Una edición es { start, end, insert, selStart, selEnd }: sustituir [start, end) por `insert`
// y dejar la selección en [selStart, selEnd) del texto resultante.

import { escapeHtml } from './markdown.js';

const lineStart = (text, pos) => text.lastIndexOf('\n', pos - 1) + 1;
const lineEnd = (text, pos) => {
  const i = text.indexOf('\n', pos);
  return i === -1 ? text.length : i;
};

const ITEM_RE = /^(\s*)((?:>\s*)*)([-*+]|(\d+)([.)]))(\s+)(\[[ xX]\]\s+)?/;

// Intro al final de un elemento de lista, tarea o cita: sigue la lista.
// Si el elemento está vacío, lo quita (termina la lista). null = comportamiento normal.
export function continueList(text, start, end) {
  if (start !== end) return null;
  const ls = lineStart(text, start);
  const line = text.slice(ls, lineEnd(text, start));
  const before = text.slice(ls, start);
  const m = before.match(ITEM_RE);
  const quote = !m && before.match(/^(\s*(?:>\s*)+)/);
  if (quote) {
    if (!line.replace(/^[\s>]*/, '')) return { start: ls, end: ls + line.length, insert: '', selStart: ls, selEnd: ls };
    const insert = `\n${quote[1]}`;
    return { start, end, insert, selStart: start + insert.length, selEnd: start + insert.length };
  }
  if (!m) return null;
  const [prefix, indent, q, bullet, num, sep, space, task] = m;
  if (!line.slice(prefix.length).trim()) {
    // Elemento vacío: si estaba sangrado, sube un nivel; si no, termina la lista.
    if (indent.length) {
      const outdented = indent.replace(/^(\t| {1,4})/, '');
      const insert = `${outdented}${q}${bullet}${space}${task || ''}`;
      return { start: ls, end: ls + line.length, insert, selStart: ls + insert.length, selEnd: ls + insert.length };
    }
    return { start: ls, end: ls + line.length, insert: '', selStart: ls, selEnd: ls };
  }
  const marker = num ? `${Number(num) + 1}${sep}` : bullet;
  const insert = `\n${indent}${q}${marker}${space}${task ? '[ ] ' : ''}`;
  return { start, end, insert, selStart: start + insert.length, selEnd: start + insert.length };
}

// Tab / Mayús+Tab sobre las líneas seleccionadas (o la línea actual si es de lista).
// null = Tab normal (insertar tabulador).
export function indentLines(text, start, end, outdent = false, unit = '    ') {
  const ls = lineStart(text, start);
  const le = lineEnd(text, end > start && text[end - 1] === '\n' ? end - 1 : end);
  const block = text.slice(ls, le);
  const multi = block.includes('\n');
  if (!multi && !outdent && !ITEM_RE.test(block)) return null;
  const lines = block.split('\n');
  let firstDelta = 0;
  let total = 0;
  const out = lines.map((l, i) => {
    let next;
    if (outdent) next = l.replace(/^(\t| {1,4})/, '');
    else next = l.length ? unit + l : l;
    const d = next.length - l.length;
    if (i === 0) firstDelta = d;
    total += d;
    return next;
  }).join('\n');
  if (!total) return null;
  return {
    start: ls,
    end: le,
    insert: out,
    selStart: Math.max(ls, start + firstDelta),
    selEnd: end + total,
  };
}

// Ctrl+B / Ctrl+I: rodea la selección o la quita si ya estaba.
export function toggleWrap(text, start, end, mark) {
  const n = mark.length;
  const sel = text.slice(start, end);
  if (text.slice(start - n, start) === mark && text.slice(end, end + n) === mark) {
    return { start: start - n, end: end + n, insert: sel, selStart: start - n, selEnd: end - n };
  }
  if (sel.length >= 2 * n && sel.startsWith(mark) && sel.endsWith(mark)) {
    const inner = sel.slice(n, -n);
    return { start, end, insert: inner, selStart: start, selEnd: start + inner.length };
  }
  return { start, end, insert: `${mark}${sel}${mark}`, selStart: start + n, selEnd: end + n };
}

// Ctrl+K: enlace Markdown con la selección como texto.
export function insertLink(text, start, end) {
  const sel = text.slice(start, end);
  if (/^https?:\/\/\S+$/.test(sel)) {
    return { start, end, insert: `[](${sel})`, selStart: start + 1, selEnd: start + 1 };
  }
  const insert = `[${sel}](https://)`;
  const urlAt = start + sel.length + 3;
  return { start, end, insert, selStart: urlAt, selEnd: urlAt + 8 };
}

// Ctrl+Intro: marca o desmarca la tarea de la línea; si no es tarea, la convierte en una.
export function toggleTask(text, start) {
  const ls = lineStart(text, start);
  const le = lineEnd(text, start);
  const line = text.slice(ls, le);
  let next;
  const t = line.match(/^(\s*(?:>\s*)*[-*+]\s+\[)([ xX])(\].*)$/);
  if (t) next = `${t[1]}${t[2] === ' ' ? 'x' : ' '}${t[3]}`;
  else if (/^\s*(?:>\s*)*[-*+]\s+/.test(line)) next = line.replace(/^(\s*(?:>\s*)*[-*+]\s+)/, '$1[ ] ');
  else next = line.replace(/^(\s*)/, '$1- [ ] ');
  const delta = next.length - line.length;
  return { start: ls, end: le, insert: next, selStart: start + delta, selEnd: start + delta };
}

// ¿Está el cursor dentro de un [[enlace a medio escribir? Devuelve { start, query } o null.
export function linkQuery(text, pos) {
  const ls = lineStart(text, pos);
  const m = text.slice(ls, pos).match(/\[\[([^\][|#\n]*)$/);
  return m ? { start: pos - m[1].length, query: m[1] } : null;
}

// Completa el enlace: sustituye la consulta por el nombre y cierra con ]] si hace falta.
export function completeLink(text, pos, q, name) {
  const closed = text.slice(pos, pos + 2) === ']]';
  const insert = closed ? name : `${name}]]`;
  const after = q.start + name.length + 2;
  return { start: q.start, end: pos, insert, selStart: after, selEnd: after };
}

// Notas que encajan con lo escrito: primero las que empiezan igual, luego las que lo contienen.
export function suggestNotes(notes, query, limit = 8) {
  const q = query.trim().toLowerCase();
  const scored = [];
  for (const n of notes) {
    const name = n.path.split('/').pop();
    const lname = name.toLowerCase();
    const lpath = n.path.toLowerCase();
    let score = -1;
    if (!q) score = 1;
    else if (lname.startsWith(q)) score = 3;
    else if (lname.includes(q)) score = 2;
    else if (lpath.includes(q)) score = 1;
    if (score >= 0) scored.push({ n, name, score });
  }
  scored.sort((a, b) => b.score - a.score || (b.n.updated || '').localeCompare(a.n.updated || '') || a.name.localeCompare(b.name, 'es'));
  return scored.slice(0, limit).map(({ n, name }) => ({ id: n.id, name, path: n.path }));
}

// ---------------------------------------------------------------------------
// Resaltado mientras se escribe. Solo cambia colores (nunca tamaños ni grosores),
// para que el texto resaltado ocupe exactamente lo mismo que el del cuadro de texto.

function hlInline(raw) {
  const slots = [];
  const keep = (cls, s) => `\u0000${slots.push(`<span class="${cls}">${s}</span>`) - 1}\u0000`;
  let s = escapeHtml(raw);
  s = s.replace(/`[^`]+`/g, (m) => keep('hl-code', m));
  s = s.replace(/!?\[\[[^\]\n]*\]\]/g, (m) => keep('hl-link', m));
  s = s.replace(/\[[^\]\n]*\]\([^)\s]*\)/g, (m) => keep('hl-link', m));
  s = s.replace(/(^|[\s(])(#[\p{L}_][\p{L}\p{N}_/-]*)/gu, (m, pre, tag) => `${pre}${keep('hl-tag', tag)}`);
  s = s.replace(/(\*\*|__)(?=\S)(.+?)\1/g, (m, mk, inner) => `${keep('hl-mark', mk)}<span class="hl-strong">${inner}</span>${keep('hl-mark', mk)}`);
  s = s.replace(/(==)(?=\S)(.+?)==/g, (m, mk, inner) => `${keep('hl-mark', mk)}<span class="hl-hilite">${inner}</span>${keep('hl-mark', mk)}`);
  s = s.replace(/(~~)(?=\S)(.+?)~~/g, (m, mk, inner) => `${keep('hl-mark', mk)}<span class="hl-del">${inner}</span>${keep('hl-mark', mk)}`);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[Number(i)]);
}

export function highlight(text) {
  const lines = text.split('\n');
  let fence = null;
  let front = lines[0] === '---';
  return lines.map((line, i) => {
    if (front) {
      if (i > 0 && line === '---') front = false;
      return `<span class="hl-front">${escapeHtml(line)}</span>`;
    }
    const f = line.match(/^\s*(```|~~~)/);
    if (f || fence) {
      if (f) fence = fence === f[1] ? null : (fence || f[1]);
      return `<span class="hl-code">${escapeHtml(line)}</span>`;
    }
    const h = line.match(/^(#{1,6}\s)(.*)$/);
    if (h) return `<span class="hl-heading"><span class="hl-mark">${h[1]}</span>${hlInline(h[2])}</span>`;
    const t = line.match(/^(\s*(?:>\s*)*[-*+]\s+)(\[[ xX]\])(.*)$/);
    if (t) {
      const done = t[2] !== '[ ]';
      return `<span class="hl-mark">${escapeHtml(t[1])}</span><span class="hl-box">${t[2]}</span><span class="${done ? 'hl-done' : ''}">${hlInline(t[3])}</span>`;
    }
    const li = line.match(/^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)(.*)$/);
    if (li) return `<span class="hl-mark">${escapeHtml(li[1])}</span>${hlInline(li[2])}`;
    const qt = line.match(/^(\s*>\s?)(.*)$/);
    if (qt) {
      const call = qt[2].match(/^(\[![\w-]+\][+-]?)(.*)$/);
      return `<span class="hl-mark">${escapeHtml(qt[1])}</span>${call ? `<span class="hl-callout">${escapeHtml(call[1])}</span>${hlInline(call[2])}` : `<span class="hl-quote">${hlInline(qt[2])}</span>`}`;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) return `<span class="hl-table">${hlInline(line)}</span>`;
    return hlInline(line);
  }).join('\n');
}
