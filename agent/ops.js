// Operaciones sobre la bóveda para agentes y scripts: listar, leer, buscar, seguir enlaces y
// escribir. Reutilizan los módulos de la app, así que se comportan igual que la web.
// Cada escritura es un commit con el mismo mensaje que pone la app (sin títulos ni rutas).

import { normalizePath, baseName, parentPath, validName } from '../public/js/vault.js';
import { contentLines } from '../public/js/noteindex.js';
import { searchNotes, tagCounts } from '../public/js/search.js';
import { applyTemplate, dailyPath, isoDate, parseIsoDate, DAILY_TEMPLATE } from '../public/js/templates.js';
import { SessionError } from './session.js';

const LINK_RE = /!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;

// Admite «Carpeta/Nota», «Nota», «Nota.md» y «[[Nota]]».
function cleanRef(ref) {
  const s = String(ref ?? '').trim().replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '').replace(/#.*$/, '');
  return normalizePath(s.replace(/\.md$/i, ''));
}

function find(v, ref) {
  const p = cleanRef(ref);
  if (!p) throw new SessionError('bad_path', 'Falta la ruta de la nota.');
  return v.findByTitle(p);
}

function mustFind(v, ref) {
  const hit = find(v, ref);
  if (!hit) throw new SessionError('not_found', `No existe la nota «${cleanRef(ref)}».`);
  return hit;
}

function checkPath(p) {
  try {
    validName(p);
  } catch (e) {
    const why = { empty_name: 'la ruta está vacía', name_too_long: 'la ruta es demasiado larga', bad_chars: 'la ruta lleva caracteres no permitidos (\\ : * ? " < > | # ^ [ ])' };
    throw new SessionError(e.message, `No se puede usar esa ruta: ${why[e.message] || e.message}.`);
  }
}

// Resultado de guardar: avisa si hubo que fusionar o guardar una copia por un cambio en otro dispositivo.
function saveInfo(v, res) {
  const out = {};
  if (res?.merged != null) out.merged = 'La nota había cambiado en otro dispositivo; se han juntado los dos cambios.';
  if (res?.conflict) out.conflict = `La nota había cambiado en otro dispositivo en las mismas líneas; la otra versión está en «${v.index.notes[res.conflict.id]?.path || res.conflict.path}».`;
  return out;
}

// Destino de un enlace: nota por ruta completa o por nombre (como resuelve la app).
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
    .sort((a, b) => a.path.localeCompare(b.path, 'es'))
    .map((n) => ({ path: n.path, updated: n.updated }));
  const folders = v.index.folders
    .filter((x) => !prefix || x.toLowerCase().startsWith(prefix))
    .filter((x) => recursive || parentPath(x).toLowerCase() === f.toLowerCase())
    .sort((a, b) => a.localeCompare(b, 'es'));
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
  if (!note) throw new SessionError('not_found', `No existe la nota «${cleanRef(path)}».`);
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
  if (!target) throw new SessionError('not_found', `No existe la nota «${cleanRef(path)}».`);
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
  out.sort((a, b) => a.path.localeCompare(b.path, 'es'));
  return { path: target.path, backlinks: out };
}

// --- Escritura ---

async function templateText(s, v, ref, fallback) {
  if (!ref) return fallback;
  const t = find(v, ref) || find(v, `${s.settings().templatesFolder}/${cleanRef(ref)}`);
  if (!t) {
    if (fallback != null) return fallback;
    throw new SessionError('not_found', `No existe la plantilla «${cleanRef(ref)}».`);
  }
  return v.read(t.id);
}

export async function createNote(s, { path, text = '', template }) {
  const v = await s.open({ refresh: true });
  const p = cleanRef(path);
  checkPath(p);
  if (v.findByPath(p)) throw new SessionError('exists', `Ya existe la nota «${p}».`);
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
  if (typeof text !== 'string') throw new SessionError('bad_text', 'Falta el texto de la nota.');
  const v = await s.open({ refresh: true });
  const hit = find(v, path);
  if (!hit) {
    if (!create) throw new SessionError('not_found', `No existe la nota «${cleanRef(path)}». Usa create: true para crearla.`);
    return createNote(s, { path, text });
  }
  await v.read(hit.id); // base para fusionar si cambió en otro dispositivo
  const res = await v.saveNote(hit.id, text);
  s.assertSaved();
  return { path: hit.path, saved: true, ...saveInfo(v, res) };
}

// Añade texto al final de la nota o al final de la sección `heading`, que llega hasta el siguiente
// encabezado del mismo nivel o superior (sus subsecciones incluidas).
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
  if (start === -1) throw new SessionError('heading_not_found', `No hay ningún encabezado «${heading}» en la nota.`);
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
  if (typeof text !== 'string' || !text.trim()) throw new SessionError('bad_text', 'Falta el texto que añadir.');
  const v = await s.open({ refresh: true });
  const hit = find(v, path);
  if (!hit) {
    if (!create || heading) throw new SessionError('not_found', `No existe la nota «${cleanRef(path)}».`);
    return createNote(s, { path, text });
  }
  const doc = await v.read(hit.id);
  const res = await v.saveNote(hit.id, appendText(doc, text, heading));
  s.assertSaved();
  return { path: hit.path, saved: true, ...saveInfo(v, res) };
}

// Nota diaria (`Diario/AAAA-MM-DD` según los ajustes), creada desde su plantilla si no existe.
export async function dailyNote(s, { date, create = true } = {}) {
  const v = await s.open({ refresh: true });
  const d = date ? parseIsoDate(String(date)) : new Date();
  if (!d) throw new SessionError('bad_date', 'La fecha debe ser AAAA-MM-DD.');
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
