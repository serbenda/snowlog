// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// Vault operations for agents and scripts: list, read, search, follow links and write.
// They reuse the app's modules, so they behave the same as the web app.
// Every write is a commit with the same message the app uses (no titles or paths).

import { normalizePath, baseName, parentPath, validName } from '../public/js/vault.js';
import { contentLines } from '../public/js/noteindex.js';
import { searchNotes, tagCounts } from '../public/js/search.js';
import { applyTemplate, dailyPath, isoDate, parseIsoDate, DAILY_TEMPLATE } from '../public/js/templates.js';
import { SessionError } from './session.js';

const LINK_RE = /!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;

// Accepts “Folder/Note”, “Note”, “Note.md” and “[[Note]]”.
function cleanRef(ref) {
  const s = String(ref ?? '').trim().replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').replace(/#.*$/, '');
  return normalizePath(s.replace(/\.md$/i, ''));
}

function find(v, ref) {
  const p = cleanRef(ref);
  if (!p) throw new SessionError('bad_path', 'The note path is missing.');
  return v.findByTitle(p);
}

function mustFind(v, ref) {
  const hit = find(v, ref);
  if (!hit) throw new SessionError('not_found', `The note “${cleanRef(ref)}” does not exist.`);
  return hit;
}

function checkPath(p) {
  try {
    validName(p);
  } catch (e) {
    const why = { empty_name: 'the path is empty', name_too_long: 'the path is too long', bad_chars: 'the path has characters that are not allowed (\\ : * ? " < > | # ^ [ ])' };
    throw new SessionError(e.message, `That path cannot be used: ${why[e.message] || e.message}.`);
  }
}

// Result of a save: says whether a merge or a copy was needed because of a change on another device.
function saveInfo(v, res) {
  const out = {};
  if (res?.merged != null) out.merged = 'The note had changed on another device; both changes were combined.';
  if (res?.conflict) out.conflict = `The note had changed on another device on the same lines; the other version is in “${v.index.notes[res.conflict.id]?.path || res.conflict.path}”.`;
  return out;
}

// Target of a link: a note by full path or by name (as the app resolves it).
function resolveTarget(notes, target) {
  const t = target.trim().toLowerCase();
  return notes.find((n) => n.path.toLowerCase() === t) || notes.find((n) => n.name.toLowerCase() === t) || null;
}

// --- Lectura ---

export async function status(s) {
  if (!s.unlocked) return { unlocked: false, reason: s.lockedReason };
  const v = await s.open();
  const ws = s.settings();
  return {
    unlocked: true,
    notes: v.notes().length,
    folders: v.index.folders.length,
    attachments: Object.keys(v.index.files || {}).length,
    head: s.repo.head,
    dailyFolder: ws.dailyFolder,
    templatesFolder: ws.templatesFolder,
    home: ws.home,
  };
}

export async function unlock(s) {
  await s.unlock();
  return status(s);
}

export function lock(s) {
  s.lock('manual');
  return { unlocked: false };
}

export async function listNotes(s, { folder = '', recursive = true } = {}) {
  const v = await s.open();
  const f = normalizePath(folder || '');
  const prefix = f ? `${f.toLowerCase()}/` : '';
  const notes = v.notes()
    .filter((n) => !prefix || n.path.toLowerCase().startsWith(prefix))
    .filter((n) => recursive || parentPath(n.path).toLowerCase() === f.toLowerCase())
    .sort((a, b) => a.path.localeCompare(b.path, 'en'))
    .map((n) => ({ path: n.path, updated: n.updated }));
  const folders = v.index.folders
    .filter((x) => !prefix || x.toLowerCase().startsWith(prefix))
    .filter((x) => recursive || parentPath(x).toLowerCase() === f.toLowerCase())
    .sort((a, b) => a.localeCompare(b, 'en'));
  return { folder: f, folders, notes };
}

export async function readNote(s, { path }) {
  const v = await s.open();
  const n = mustFind(v, path);
  return { path: n.path, created: n.created, updated: n.updated, text: await v.read(n.id) };
}

export async function search(s, { query, limit = 20 }) {
  const notes = await s.allNotes();
  const res = searchNotes(notes, String(query || ''), { limit, perNote: 3 });
  return {
    total: res.total || 0,
    results: res.map((r) => ({ path: r.note.path, count: r.count, matches: r.matches.map((m) => ({ line: m.line + 1, text: m.text })) })),
  };
}

export async function listTags(s) {
  return { tags: tagCounts(await s.allNotes()) };
}

export async function links(s, { path }) {
  const notes = await s.allNotes();
  const note = resolveTarget(notes, cleanRef(path));
  if (!note) throw new SessionError('not_found', `The note “${cleanRef(path)}” does not exist.`);
  const out = [];
  const seen = new Set();
  for (const { line, value } of contentLines(note.text)) {
    for (const m of value.replace(/`[^`]*`/g, '').matchAll(LINK_RE)) {
      const target = m[1].trim();
      const key = target.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const hit = resolveTarget(notes, target);
      out.push({ target, path: hit ? hit.path : null, line: line + 1 });
    }
  }
  return { path: note.path, links: out, unresolved: out.filter((l) => !l.path).length };
}

export async function backlinks(s, { path }) {
  const notes = await s.allNotes();
  const target = resolveTarget(notes, cleanRef(path));
  if (!target) throw new SessionError('not_found', `The note “${cleanRef(path)}” does not exist.`);
  const names = new Set([target.name.toLowerCase(), target.path.toLowerCase()]);
  const out = [];
  for (const n of notes) {
    if (n.id === target.id) continue;
    if (![...n.links].some((l) => names.has(l))) continue;
    const lines = [];
    for (const { line, value } of contentLines(n.text)) {
      const hits = [...value.replace(/`[^`]*`/g, '').matchAll(LINK_RE)].some((m) => names.has(m[1].trim().toLowerCase()));
      if (hits) lines.push({ line: line + 1, text: value.trim() });
    }
    out.push({ path: n.path, lines });
  }
  out.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return { path: target.path, backlinks: out };
}

// --- Escritura ---

async function templateText(s, v, ref, fallback) {
  if (!ref) return fallback;
  const t = find(v, ref) || find(v, `${s.settings().templatesFolder}/${cleanRef(ref)}`);
  if (!t) {
    if (fallback != null) return fallback;
    throw new SessionError('not_found', `The template “${cleanRef(ref)}” does not exist.`);
  }
  return v.read(t.id);
}

export async function createNote(s, { path, text = '', template }) {
  const v = await s.open({ refresh: true });
  const p = cleanRef(path);
  checkPath(p);
  if (v.findByPath(p)) throw new SessionError('exists', `The note “${p}” already exists.`);
  let body = text;
  if (template) {
    const tpl = applyTemplate(await templateText(s, v, template), { title: baseName(p), date: new Date() });
    body = text ? `${tpl.replace(/\s*$/, '')}\n\n${text}` : tpl;
  }
  await v.createNote(p, body);
  s.assertSaved();
  return { path: p, created: true };
}

export async function writeNote(s, { path, text, create = false }) {
  if (typeof text !== 'string') throw new SessionError('bad_text', 'The note text is missing.');
  const v = await s.open({ refresh: true });
  const hit = find(v, path);
  if (!hit) {
    if (!create) throw new SessionError('not_found', `The note “${cleanRef(path)}” does not exist. Use create: true to create it.`);
    return createNote(s, { path, text });
  }
  await v.read(hit.id); // base for merging if it changed on another device
  const res = await v.saveNote(hit.id, text);
  s.assertSaved();
  return { path: hit.path, saved: true, ...saveInfo(v, res) };
}

// Appends text at the end of the note or at the end of the `heading` section, which runs until the
// next heading of the same or a higher level (its subsections included).
export function appendText(doc, text, heading) {
  const add = text.replace(/\s+$/, '');
  if (!heading) {
    const base = doc.replace(/\s+$/, '');
    return base ? `${base}\n${add}\n` : `${add}\n`;
  }
  const want = heading.replace(/^#+\s*/, '').trim().toLowerCase();
  const lines = doc.split('\n');
  const inCode = new Set();
  let fence = null;
  lines.forEach((l, i) => {
    const m = l.match(/^\s*(```|~~~)/);
    if (m) fence = fence === m[1] ? null : (fence || m[1]);
    else if (fence) inCode.add(i);
  });
  const headingAt = (i) => (!inCode.has(i) && lines[i].match(/^(#{1,6})\s+(.*?)\s*#*\s*$/)) || null;
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const h = headingAt(i);
    if (h && h[2].trim().toLowerCase() === want) {
      start = i;
      level = h[1].length;
      break;
    }
  }
  if (start === -1) throw new SessionError('heading_not_found', `There is no heading “${heading}” in the note.`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const h = headingAt(i);
    if (h && h[1].length <= level) {
      end = i;
      break;
    }
  }
  let at = end;
  while (at > start + 1 && !lines[at - 1].trim()) at -= 1;
  const tail = lines.slice(end);
  const before = lines.slice(0, at);
  const sep = end < lines.length ? [''] : [];
  return [...before, add, ...sep, ...tail].join('\n').replace(/\n*$/, '\n');
}

export async function appendNote(s, { path, text, heading, create = false }) {
  if (typeof text !== 'string' || !text.trim()) throw new SessionError('bad_text', 'The text to append is missing.');
  const v = await s.open({ refresh: true });
  const hit = find(v, path);
  if (!hit) {
    if (!create || heading) throw new SessionError('not_found', `The note “${cleanRef(path)}” does not exist.`);
    return createNote(s, { path, text });
  }
  const doc = await v.read(hit.id);
  const res = await v.saveNote(hit.id, appendText(doc, text, heading));
  s.assertSaved();
  return { path: hit.path, saved: true, ...saveInfo(v, res) };
}

// Daily note (`Daily/YYYY-MM-DD` per the settings), created from its template if it does not exist.
export async function dailyNote(s, { date, create = true } = {}) {
  const v = await s.open({ refresh: true });
  const d = date ? parseIsoDate(String(date)) : new Date();
  if (!d) throw new SessionError('bad_date', 'The date must be YYYY-MM-DD.');
  const ws = s.settings();
  const p = dailyPath(ws.dailyFolder || '', d);
  const hit = v.findByPath(p);
  if (hit) return { path: p, created: false, text: await v.read(hit.id) };
  if (!create) return { path: p, created: false, exists: false };
  const tpl = await templateText(s, v, ws.dailyTemplate || '', DAILY_TEMPLATE);
  const text = applyTemplate(tpl, { title: isoDate(d), date: d });
  await v.createNote(p, text);
  s.assertSaved();
  return { path: p, created: true, text };
}
