// Snowlog: interfaz principal.
import { CONFIG } from './config.js';
import * as C from './crypto.js';
import * as Auth from './auth.js';
import { GitHubRepo } from './github.js';
import { Vault, baseName, parentPath, normalizePath, extOf, isAttachmentName } from './vault.js';
import { render, inline, outline, wordCount, escapeHtml } from './markdown.js';
import { planImport, formatBytes } from './import.js';
import { exampleSpace } from './examples.js';
import { LocalVault } from './localvault.js';
import { makeZip, readZip } from './zip.js';
import { rewriteLinks, linkChanges } from './links.js';
import * as Ed from './editor.js';
import { searchNotes, tagCounts, fold } from './search.js';
import { makeBackup, openBackup, parseBackup } from './backup.js';
import { openCache } from './cache.js';
import * as K from './kanban.js';
import { merge3 } from './merge.js';
import { openKvDir, browserBackend } from './kvdir.js';
import { buildGraph, localGraph, initLayout, step as graphStep } from './graph.js';
import { parseNote, toggleTaskLine, linksTo, contentLines, TASK_LINE_RE } from './noteindex.js';
import { parseQuery, runQuery, renderResult } from './query.js';
import { applyTemplate, dailyPath, isoDate, parseIsoDate, DAILY_TEMPLATE, starterSpace, formatDate } from './templates.js';

// ---------------------------------------------------------------------------
// Iconos (trazos propios, estilo línea)
const ICONS = {
  files: 'M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
  search: 'M17 11a6 6 0 1 1-12 0a6 6 0 1 1 12 0z M20 20l-4.5-4.5',
  filePlus: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M12 11v6 M9 14h6',
  folderPlus: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M12 10v6 M9 13h6',
  collapse: 'M8 9l4-4 4 4 M8 15l4 4 4-4',
  lock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3',
  logout: 'M14 4h5v16h-5 M10 8l-4 4 4 4 M6 12h10',
  sidebarRight: 'M4 5h16v14H4z M15 5v14',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  read: 'M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z',
  edit: 'M4 20h4L19 9l-4-4L4 16z M14 6l4 4',
  more: 'M6 12h.01 M12 12h.01 M18 12h.01',
  chevron: 'M9 6l6 6-6 6',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M9 7V4h6v3 M6 7l1 13h10l1-13',
  rename: 'M4 20h4L19 9l-4-4L4 16z',
  move: 'M5 12h14 M13 6l6 6-6 6',
  import: 'M12 4v11 M7 10l5 5 5-5 M4 19h16',
  today: 'M5 6h14v14H5z M5 10h14 M9 4v4 M15 4v4 M9 14h2v2H9z',
  home: 'M4 11l8-7 8 7 M6 10v10h12V10 M10 20v-5h4v5',
  template: 'M6 4h12v16H6z M9 8h6 M9 12h6 M9 16h3',
  setup: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12L4 7.5',
  chevronLeft: 'M15 6l-6 6 6 6',
  example: 'M9 4h6l-1 5 4 9a2 2 0 0 1-2 3H8a2 2 0 0 1-2-3l4-9z M8 15h8',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  tag: 'M4 4h7l9 9-7 7-9-9z M8 8h.01',
  history: 'M4 12a8 8 0 1 0 2.3-5.6 M4 4v4h4 M12 8v4l3 2',
  bookmark: 'M7 4h10v16l-5-4-5 4z',
  kanban: 'M4 5h4v14H4z M10 5h4v9h-4z M16 5h4v6h-4z',
  graph: 'M6 7a2 2 0 1 0 0-.1z M18 6a2 2 0 1 0 0-.1z M12 18a2 2 0 1 0 0-.1z M7.5 7.8l3.4 8.6 M16.6 7.4l-3.6 8.9 M8 6.3h8',
  command: 'M4 6l5 6-5 6 M12 18h8',
  settings: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1',
  settings: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1',
  key: 'M14 10a4 4 0 1 0-1.2 2.8L20 20 M17 17l2-2',
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;

// Trusted Types: la CSP solo deja meter HTML a través de esta política. Solo recibe HTML que ya
// se ha escapado (markdown.js, editor.js, query.js) o iconos propios; nunca texto de una nota en crudo.
const TT = globalThis.trustedTypes?.createPolicy('snowlog', {
  createHTML: (s) => s,
  // El único script que se carga a mano es el service worker.
  createScriptURL: (u) => {
    if (u !== 'sw.js') throw new Error('script_no_permitido');
    return u;
  },
});
const trusted = (s) => (TT ? TT.createHTML(s) : s);

const $ = (id) => document.getElementById(id);
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = trusted(v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

// ---------------------------------------------------------------------------
// Estado
const S = {
  cred: null,
  dek: null,
  repo: null,
  vault: null,
  vaultFile: null,
  current: null,
  mode: 'edit',
  dirty: false,
  saveTimer: null,
  saving: Promise.resolve(),
  expanded: new Set(),
  lastActivity: Date.now(),
  local: false, // true = notas en una carpeta local o en el navegador (sin GitHub)
  notesIdx: new Map(), // id -> nota analizada (solo en memoria)
  indexReady: null,
  calMonth: null,
};
// Ajustes vigentes: los de config.js como base y encima los de la bóveda («Ajustes» en la app).
const DEFAULTS = { ...(CONFIG.workspace || {}), lockAfterMinutes: CONFIG.lockAfterMinutes, backupReminderDays: CONFIG.backupReminderDays };
const WS = { ...DEFAULTS };
function applySettings() {
  for (const k of Object.keys(WS)) delete WS[k];
  Object.assign(WS, DEFAULTS, S.vault?.getSettings?.() || {});
}

// Tema de este dispositivo: automático (el del sistema), claro u oscuro.
function applyTheme(theme = (() => { try { return localStorage.getItem('snowlog.theme') || 'auto'; } catch { return 'auto'; } })()) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

const isMobile = () => matchMedia('(max-width: 760px)').matches;

// ---------------------------------------------------------------------------
// Mensajes de error legibles
function errText(e) {
  const m = e?.message || '';
  const map = {
    exists: 'Ya existe una nota o carpeta con ese nombre.',
    empty_name: 'El nombre no puede estar vacío.',
    bad_chars: 'El nombre no puede contener \\ : * ? " < > | # ^ [ ]',
    name_too_long: 'El nombre es demasiado largo.',
    into_itself: 'No puedes mover una carpeta dentro de sí misma.',
    bad_secret: 'No es correcto. Revísalo e inténtalo de nuevo.',
    bad_state: 'El inicio de sesión no es válido. Vuelve a intentarlo.',
    oauth_denied: 'Has cancelado el acceso en GitHub.',
    no_worker: 'Falta configurar el servicio de login (authWorker).',
    session_expired: 'La sesión de GitHub ha caducado. Vuelve a entrar.',
    vault_exists: 'Ya hay una bóveda en el repo.',
    offline: 'Sin conexión: esto se podrá hacer cuando vuelva la red. Lo que escribes en las notas sí se guarda.',
    bad_backup: 'Ese fichero no es una copia de seguridad de Snowlog o está dañado.',
    bad_zip: 'El contenido de la copia está dañado.',
    zip_compressed: 'Este .zip está comprimido y no se puede leer aquí. Descomprímelo y usa «Importar carpeta».',
    bad_type: 'Solo se pueden adjuntar imágenes (png, jpg, gif, webp, avif, bmp) y PDF.',
    too_big: 'El adjunto es demasiado grande (máximo 20 MB).',
  };
  if (map[m]) return map[m];
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') return 'El navegador no ha dado permiso para usar la carpeta.';
  if (e?.name === 'NotFoundError') return 'No encuentro el fichero o la carpeta. ¿Se ha movido o borrado fuera de Snowlog?';
  if (e?.name === 'QuotaExceededError') return 'No queda espacio en el almacenamiento del navegador.';
  if (e?.status === 401) return 'GitHub ha rechazado el acceso: la sesión o el token han caducado.';
  if (e?.status === 403) return 'GitHub deniega el permiso. Revisa que el acceso incluya el repo de notas con permiso de escritura.';
  if (e?.status === 404) return `No encuentro ${CONFIG.notesRepo.owner}/${CONFIG.notesRepo.repo}. Comprueba que existe y que tienes acceso.`;
  if (e?.status === 409) return 'Otro dispositivo ha guardado a la vez. Inténtalo de nuevo.';
  if (e instanceof TypeError) return 'No hay conexión con GitHub.';
  return m || 'Ha ocurrido un error.';
}

function notice(text, kind = '') {
  const el = h('div', { class: `notice ${kind}` }, text);
  $('notices').append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 7000 : 3500);
}

// ---------------------------------------------------------------------------
// Pantallas de acceso
function lockScreen(...children) {
  $('app').hidden = true;
  $('lock').hidden = false;
  const card = $('lock-card');
  card.replaceChildren(
    h('div', { class: 'lock-logo' }, h('img', { src: 'icon.svg', alt: '' }), h('span', {}, 'Snowlog')),
    ...children.filter((c) => c != null && c !== false),
  );
  const first = card.querySelector('input:not([type=checkbox])');
  if (first) first.focus();
}

function busy(button, text) {
  const old = button.textContent;
  button.disabled = true;
  button.textContent = text;
  return () => {
    button.disabled = false;
    button.textContent = old;
  };
}

function errorLine() {
  return h('p', { class: 'error-text', role: 'alert', hidden: true });
}
function showError(el, e) {
  el.textContent = typeof e === 'string' ? e : errText(e);
  el.hidden = false;
}

function showLogin(message) {
  const err = errorLine();
  const tokenInput = h('input', { class: 'input', type: 'password', id: 'pat', autocomplete: 'off', placeholder: 'github_pat_…' });
  const tokenForm = h('form', { hidden: true },
    h('div', { class: 'field' }, h('label', { for: 'pat' }, 'Token personal (fine-grained, solo el repo de notas)'), tokenInput),
    h('button', { class: 'btn primary', type: 'submit' }, 'Continuar'));
  tokenForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!tokenInput.value.trim()) return;
    S.cred = Auth.patCred(tokenInput.value);
    tokenInput.value = '';
    await afterAuth(err, tokenForm.querySelector('button'));
  });

  const githubBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => Auth.startOAuth() }, 'Entrar con GitHub');
  const oauthHint = Auth.oauthAvailable() ? null
    : h('p', { class: 'hint' }, 'El login con GitHub aún no está configurado. De momento, entra con un token personal.');
  if (oauthHint) githubBtn.disabled = true;

  lockScreen(
    h('h1', {}, 'Tu cuaderno cifrado'),
    h('p', {}, message || 'Entra con tu cuenta de GitHub para abrir tus notas.'),
    githubBtn,
    oauthHint,
    h('div', { class: 'lock-links' },
      h('button', { class: 'link-btn', type: 'button', onclick: () => { tokenForm.hidden = false; tokenInput.focus(); } }, 'Usar un token personal'),
      h('button', { class: 'link-btn', type: 'button', onclick: () => showLocalStart() }, 'Usar notas de este ordenador, sin GitHub'),
      h('a', { class: 'link-btn', href: 'snowlog-portable.html', download: 'snowlog-portable.html' }, 'Descargar la versión portátil')),
    tokenForm,
    err,
  );
}

// ---------------------------------------------------------------------------
// Modo local: carpeta del ordenador o almacenamiento del navegador (sin red)
// Caché cifrada de las notas del repo configurado (solo texto cifrado, como en GitHub).
const noteCache = () => openCache(`${CONFIG.notesRepo.owner}/${CONFIG.notesRepo.repo}`);

const IDB_NAME = 'snowlog';
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', mode);
      const r = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
      tx.onerror = () => reject(tx.error);
    };
  });
}
const rememberHandle = (handle) => idb('readwrite', (st) => st.put(handle, 'localHandle')).catch(() => {});
const recallHandle = () => idb('readonly', (st) => st.get('localHandle')).catch(() => null);
const forgetHandle = () => idb('readwrite', (st) => st.delete('localHandle')).catch(() => {});

const canPickFolder = () => typeof window.showDirectoryPicker === 'function';
// El almacenamiento del navegador no existe para ficheros abiertos desde disco (file://).
async function canUseBrowser() {
  if (!(navigator.storage && navigator.storage.getDirectory)) return false;
  try {
    await navigator.storage.getDirectory();
    return true;
  } catch {
    return false;
  }
}

async function showLocalStart(message) {
  const err = errorLine();
  if (message) showError(err, message);
  const remembered = canPickFolder() ? await recallHandle() : null;
  const browserOk = await canUseBrowser();
  // Firefox, Safari (y Chrome abriendo el fichero desde el disco): sin carpetas ni OPFS, las notas
  // pueden guardarse igualmente dentro del navegador (IndexedDB o localStorage).
  const kv = browserOk ? null : await browserBackend();
  const inside = kv && h('button', { class: `btn${canPickFolder() ? '' : ' primary'}`, type: 'button' }, 'Guardar dentro del navegador');
  if (inside) {
    inside.addEventListener('click', async () => {
      try {
        await openLocal(await openKvDir(kv), 'memory', inside);
      } catch (e) {
        showError(err, e);
      }
    });
  }
  if (!canPickFolder() && !browserOk && inside) {
    lockScreen(
      h('h1', {}, 'Tus notas, en este navegador'),
      h('p', {}, 'Este navegador no deja elegir carpetas del disco (eso solo lo hacen Chrome y Edge). Las notas se guardan dentro del navegador, en este ordenador, y siguen aquí la próxima vez que abras este fichero.'),
      inside,
      h('p', { class: 'hint' }, 'Para llevarlas a otro sitio o tener copia, usa «Copia de seguridad (.zip)» en el menú ⋯. Si borras los datos del navegador, se borran también las notas.'),
      CONFIG.mode === 'portable' ? null
        : h('div', { class: 'lock-links' }, h('button', { class: 'link-btn', type: 'button', onclick: () => showLogin() }, 'Volver al acceso con GitHub')),
      err,
    );
    return;
  }
  if (!canPickFolder() && !browserOk) {
    lockScreen(
      h('h1', {}, 'Abre Snowlog con Chrome o Edge'),
      h('p', {}, 'Este navegador no permite guardar notas desde un fichero abierto en el disco. Abre snowlog-portable.html con Google Chrome o Microsoft Edge (clic derecho → Abrir con).'),
      CONFIG.mode === 'portable' ? null
        : h('div', { class: 'lock-links' }, h('button', { class: 'link-btn', type: 'button', onclick: () => showLogin() }, 'Volver al acceso con GitHub')),
    );
    return;
  }
  const pick = h('button', { class: 'btn primary', type: 'button' }, remembered ? 'Elegir otra carpeta' : 'Abrir una carpeta');
  pick.addEventListener('click', async () => {
    try {
      const handle = await window.showDirectoryPicker({ id: 'snowlog', mode: 'readwrite' });
      await rememberHandle(handle);
      await openLocal(handle, 'folder', pick);
    } catch (e) {
      if (e?.name !== 'AbortError') showError(err, e);
    }
  });
  const again = remembered && h('button', { class: 'btn primary', type: 'button' }, `Continuar con «${remembered.name}»`);
  if (again) {
    pick.classList.remove('primary');
    again.addEventListener('click', async () => {
      try {
        const perm = await remembered.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
        await openLocal(remembered, 'folder', again);
      } catch (e) {
        showError(err, e);
      }
    });
  }
  const browser = h('button', { class: `btn${canPickFolder() ? '' : ' primary'}`, type: 'button' }, 'Guardar en este navegador');
  browser.addEventListener('click', async () => {
    try {
      await openLocal(await navigator.storage.getDirectory(), 'browser', browser);
    } catch (e) {
      showError(err, e);
    }
  });
  lockScreen(
    h('h1', {}, 'Tus notas, en este ordenador'),
    h('p', {}, canPickFolder()
      ? 'Elige una carpeta: cada nota es un fichero .md normal, como en Obsidian. Nada sale de tu ordenador.'
      : 'Este navegador no deja elegir carpetas (usa Chrome o Edge para eso). Puedes guardar las notas dentro del navegador y exportarlas en .zip cuando quieras.'),
    again || null,
    canPickFolder() ? pick : null,
    browserOk ? browser : inside,
    h('p', { class: 'hint' }, 'Sin internet y sin instalar nada. Las notas no se cifran: quedan protegidas por tu sesión del ordenador.'),
    CONFIG.mode === 'portable' ? null
      : h('div', { class: 'lock-links' }, h('button', { class: 'link-btn', type: 'button', onclick: () => showLogin() }, 'Volver al acceso con GitHub')),
    err,
  );
}

async function openLocal(handle, kind, button) {
  const done = button ? busy(button, 'Abriendo…') : () => {};
  try {
    const vault = await new LocalVault(handle, { kind, label: kind === 'folder' ? handle.name : 'este navegador' }).load();
    S.local = true;
    S.vault = vault;
    S.dek = null;
    S.cred = null;
    S.repo = null;
    enterApp();
  } finally {
    done();
  }
}

async function reloadLocal() {
  if (!S.local) return;
  await saveNow();
  const { root, kind, label } = S.vault;
  S.vault = await new LocalVault(root, { kind, label }).load();
  S.current = null;
  enterApp();
  notice('Carpeta recargada.');
}

// Todas las notas y adjuntos, para exportar o copiar: [{ path, text }] y [{ path, data }].
async function collectFiles() {
  const files = [];
  for (const n of S.vault.notes()) files.push({ path: `${n.path}.md`, text: await S.vault.read(n.id) });
  for (const f of S.vault.files()) files.push({ path: f.path, data: await S.vault.readFile(f.id) });
  return files;
}

function download(bytes, name, type) {
  const a = h('a', { href: URL.createObjectURL(new Blob([bytes], { type })), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// --- Copias de seguridad ---
// Solo se recuerda la fecha de la última copia (nada secreto) para avisar si pasa mucho tiempo.
const backupKey = () => `snowlog.backup.${S.local ? 'local' : `${CONFIG.notesRepo.owner}/${CONFIG.notesRepo.repo}`}`;
function backupState() {
  try {
    return JSON.parse(localStorage.getItem(backupKey()) || 'null') || {};
  } catch {
    return {};
  }
}
function saveBackupState(st) {
  try { localStorage.setItem(backupKey(), JSON.stringify(st)); } catch { /* sin almacenamiento */ }
}

function backupReminder() {
  const days = Number(WS.backupReminderDays) || 0;
  if (!days || !S.vault || !S.vault.notes().length) return;
  const st = backupState();
  const now = Date.now();
  if (!st.since) saveBackupState({ ...st, since: now });
  const from = st.last || st.since || now;
  if (now - from < days * 86400000 || (st.snoozed && now - st.snoozed < 86400000)) return;
  const n = h('div', { class: 'notice' },
    st.last ? `Tu última copia de seguridad es de hace ${Math.floor((now - st.last) / 86400000)} días. ` : 'Aún no has hecho ninguna copia de seguridad. ',
    h('button', { class: 'link-btn', type: 'button', onclick: () => { n.remove(); backupNow(); } }, 'Hacer copia ahora'),
    ' · ',
    h('button', { class: 'link-btn', type: 'button', onclick: () => { n.remove(); saveBackupState({ ...backupState(), snoozed: Date.now() }); } }, 'Mañana'));
  $('notices').append(n);
  setTimeout(() => n.remove(), 30000);
}

// Online: fichero .snowlog cifrado (se abre con la frase o el código). Local: .zip con los .md.
async function backupNow() {
  if (!S.vault) return;
  if (S.local) return exportZip();
  await saveNow();
  setStatus('');
  $('st-sync').textContent = 'Preparando la copia cifrada…';
  try {
    const files = await collectFiles();
    const vaultFile = (await Vault.fetchVaultFile(S.repo).catch(() => null)) || S.vaultFile;
    download(await makeBackup(vaultFile, S.dek, files), `snowlog-copia-${isoDate(new Date())}.snowlog`, 'application/octet-stream');
    saveBackupState({ ...backupState(), last: Date.now() });
    notice(`Copia cifrada descargada: ${files.length} ficheros. Se abre con tu frase de paso o tu código de recuperación.`);
  } catch (e) {
    notice(errText(e), 'error');
  } finally {
    $('st-sync').textContent = '';
  }
}

// Abre una copia para importarla: .snowlog (cifrada, de la versión online) o .zip (de la portátil o
// de «Exportar sin cifrar»). Así se pasan las notas de una versión a la otra.
async function restoreBackup(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  let opened;
  let created;
  if (isZip) {
    try {
      opened = { files: readZip(bytes) };
    } catch (e) {
      return notice(errText(e), 'error');
    }
    created = new Date(file.lastModified || Date.now()).toISOString();
  } else {
    let meta;
    try {
      meta = parseBackup(bytes);
    } catch (e) {
      return notice(errText(e), 'error');
    }
    created = meta.created;
    const when = dateFmt.format(new Date(meta.created));
    opened = await secretForm('Abrir copia de seguridad',
      `Copia del ${when} con ${meta.notes} nota${meta.notes === 1 ? '' : 's'}. Se abre con la frase de paso que tenías entonces o con el código de recuperación.`,
      [passField('bk0', 'Frase de paso o código de recuperación')],
      'Abrir',
      async ([secret]) => openBackup(bytes, secret));
    if (!opened) return;
  }
  const hiddenPath = (p) => p.split('/').some((part) => part.startsWith('.'));
  const count = opened.files.filter((f) => /\.md$/i.test(f.path) && !hiddenPath(f.path)).length;
  if (!opened.files.length) return notice('La copia está vacía.', 'error');
  const folder = `Copia ${isoDate(new Date(created))}`;
  const action = await pickModal(`${count} nota${count === 1 ? '' : 's'} en la copia. ¿Qué hacemos?`, [
    { label: `Importarlas en la carpeta «${folder}»`, sub: 'Tus notas actuales no se tocan', value: 'folder' },
    { label: 'Importarlas tal cual, con sus carpetas', sub: 'Para pasar todo de una versión a otra. Si un nombre ya existe, se añade «(importada)»', value: 'root' },
    !isZip && { label: 'Descargarla como .zip sin cifrar', sub: 'Para abrirla con cualquier editor', value: 'zip' },
  ].filter(Boolean));
  if (action === 'zip') return download(opened.zip, `${folder}.zip`, 'application/zip');
  if (action !== 'folder' && action !== 'root') return;
  const target = action === 'folder' ? folder : '';
  const at = (p) => (target ? `${target}/${p}` : p);
  await saveNow();
  const dec = new TextDecoder();
  const notes = opened.files.filter((f) => /\.md$/i.test(f.path))
    .filter((f) => !hiddenPath(f.path))
    .map((f) => ({ path: at(f.path.replace(/\.md$/i, '')), text: dec.decode(f.data) }));
  const others = opened.files.filter((f) => !/\.md$/i.test(f.path) && isAttachmentName(f.path) && !hiddenPath(f.path));
  const st = $('st-sync');
  try {
    st.textContent = `Importando 0/${notes.length}…`;
    const result = await S.vault.importNotes(notes, { message: 'restaurar copia', onProgress: (d, t) => { S.lastActivity = Date.now(); st.textContent = `Importando ${d}/${t}…`; } });
    let skipped = 0;
    for (const f of others) {
      try {
        await S.vault.addFile(parentPath(at(f.path)), baseName(f.path), f.data);
      } catch { skipped += 1; }
    }
    if (target) S.expanded.add(target);
    renderTree();
    syncIndex();
    notice(`Copia importada${target ? ` en «${target}»` : ''}: ${result.length} notas${others.length ? ` y ${others.length - skipped} adjuntos` : ''}.`);
  } catch (e) {
    renderTree();
    notice(`La importación se ha detenido: ${errText(e)}. Lo ya importado se conserva.`, 'error');
  } finally {
    st.textContent = '';
  }
}

async function exportZip() {
  if (!S.vault) return;
  if (!S.local) {
    const ok = await confirmModal('Exportar copia sin cifrar',
      'La copia .zip tendrá todas tus notas en claro. Guárdala en un sitio seguro.', 'Exportar', false);
    if (!ok) return;
  }
  await saveNow();
  setStatus('');
  $('st-sync').textContent = 'Preparando la copia…';
  try {
    const files = await collectFiles();
    download(makeZip(files), `snowlog-${isoDate(new Date())}.zip`, 'application/zip');
    if (S.local) saveBackupState({ ...backupState(), last: Date.now() });
    notice(`Copia exportada: ${files.length} ficheros.`);
  } catch (e) {
    notice(errText(e), 'error');
  } finally {
    $('st-sync').textContent = '';
  }
}

// Tras tener credenciales: comprobar el repo y abrir o crear la bóveda.
async function afterAuth(errEl, button) {
  const done = button ? busy(button, 'Conectando…') : () => {};
  try {
    S.repo = makeRepo();
    await S.repo.check();
    const vaultFile = await Vault.fetchVaultFile(S.repo);
    done();
    if (!vaultFile) showCreate();
    else showUnlock(vaultFile, { fresh: true });
  } catch (e) {
    done();
    S.cred = null;
    if (errEl) showError(errEl, e);
    else showLogin(errText(e));
  }
}

function makeRepo() {
  return new GitHubRepo(
    CONFIG.notesRepo,
    async () => {
      if (Auth.needsRefresh(S.cred) && Auth.canRefresh(S.cred)) await renewToken();
      return S.cred.token;
    },
    async () => {
      if (!Auth.canRefresh(S.cred)) return false;
      try {
        await renewToken();
        return true;
      } catch {
        return false;
      }
    },
  );
}

async function renewToken() {
  S.cred = await Auth.refresh(S.cred);
  if (S.dek) await Auth.saveCred(S.dek, S.cred);
}

function passField(id, label, autocomplete = 'current-password') {
  const input = h('input', { class: 'input', type: 'password', id, autocomplete, required: true });
  return [h('div', { class: 'field' }, h('label', { for: id }, label), input), input];
}

function showCreate() {
  const err = errorLine();
  const [f1, p1] = passField('p1', 'Frase de paso (mínimo 12 caracteres)', 'new-password');
  const [f2, p2] = passField('p2', 'Repite la frase de paso', 'new-password');
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Crear bóveda cifrada');
  const form = h('form', {}, f1, f2, btn, err);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (p1.value.length < 12) return showError(err, 'Usa al menos 12 caracteres. Una frase de varias palabras es lo mejor.');
    if (p1.value !== p2.value) return showError(err, 'Las dos frases no coinciden.');
    const done = busy(btn, 'Cifrando y creando…');
    try {
      const { vault, vaultFile, recoveryCode } = await Vault.create(S.repo, p1.value, CONFIG.kdfIterations);
      p1.value = '';
      p2.value = '';
      S.vault = vault;
      vault.store = noteCache();
      S.dek = vault.dek;
      S.vaultFile = vaultFile;
      Auth.cacheVault(vaultFile);
      await Auth.saveCred(S.dek, S.cred);
      showRecoveryCode(recoveryCode);
    } catch (e) {
      done();
      showError(err, e);
    }
  });
  lockScreen(
    h('h1', {}, 'Crea tu bóveda'),
    h('p', {}, 'Tus notas se cifran en este dispositivo con esta frase antes de subir a GitHub. Nunca sale de aquí: si la pierdes, solo el código de recuperación podrá abrir tus notas.'),
    form,
  );
}

function showRecoveryCode(code) {
  const check = h('input', { type: 'checkbox', id: 'saved' });
  const btn = h('button', { class: 'btn primary', type: 'button', disabled: true, onclick: () => enterApp() }, 'Entrar en Snowlog');
  check.addEventListener('change', () => { btn.disabled = !check.checked; });
  lockScreen(
    h('h1', {}, 'Guarda tu código de recuperación'),
    h('p', {}, 'Es la única forma de recuperar tus notas si olvidas la frase de paso. Apúntalo en papel y guárdalo en un sitio seguro. No se volverá a mostrar.'),
    h('div', { class: 'recovery-code' }, code),
    h('label', { class: 'check', for: 'saved' }, check, 'Lo he guardado en un sitio seguro'),
    btn,
  );
}

function showUnlock(vaultFile, { fresh = false } = {}) {
  const err = errorLine();
  const [f1, p1] = passField('pp', 'Frase de paso');
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Desbloquear');
  const form = h('form', {}, f1, btn, err);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const done = busy(btn, 'Descifrando…');
    try {
      S.dek = await C.unlockVault(vaultFile, p1.value);
      p1.value = '';
      S.vaultFile = vaultFile;
      await afterUnlock(fresh);
    } catch (e) {
      S.dek = null;
      done();
      showError(err, e);
    }
  });
  lockScreen(
    h('h1', {}, 'Desbloquea tus notas'),
    h('p', {}, `Bóveda en ${CONFIG.notesRepo.owner}/${CONFIG.notesRepo.repo}.`),
    form,
    h('div', { class: 'lock-links' },
      h('button', { class: 'link-btn', type: 'button', onclick: () => showRecover(vaultFile, fresh) }, 'He olvidado la frase de paso'),
      h('button', { class: 'link-btn', type: 'button', onclick: () => forgetAndLogin() }, 'Usar otra cuenta u olvidar este dispositivo')),
  );
}

// Con la DEK ya descifrada: recuperar credenciales guardadas si hace falta y abrir.
async function afterUnlock(fresh) {
  if (!fresh) {
    S.cred = await Auth.loadCred(S.dek);
    if (!S.cred) {
      S.dek = null;
      return showLogin('La sesión de este dispositivo ha caducado. Vuelve a entrar.');
    }
    S.repo = makeRepo();
    if (Auth.needsRefresh(S.cred)) {
      try {
        await renewToken();
      } catch (e) {
        // Sin red se entra igual con lo guardado en este dispositivo; el token se renueva al volver.
        if (!(e instanceof TypeError)) {
          S.dek = null;
          S.cred = null;
          return showLogin(errText(e));
        }
      }
    }
    // Actualiza la copia local de vault.json por si cambió en otro dispositivo.
    try {
      const remote = await Vault.fetchVaultFile(S.repo);
      if (remote) {
        Auth.cacheVault(remote);
        S.vaultFile = remote;
      }
    } catch { /* se sigue con la copia local */ }
  } else {
    Auth.cacheVault(S.vaultFile);
  }
  await Auth.saveCred(S.dek, S.cred);
  S.vault = new Vault(S.repo, S.dek, { store: noteCache() });
  await S.vault.loadIndex();
  enterApp();
  if (S.vault.outbox.size && !S.vault.offline) trySync();
}

function showRecover(vaultFile, fresh) {
  const err = errorLine();
  const code = h('input', { class: 'input', id: 'rc', autocomplete: 'off', spellcheck: 'false', placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX' });
  const [f1, p1] = passField('n1', 'Nueva frase de paso (mínimo 12 caracteres)', 'new-password');
  const [f2, p2] = passField('n2', 'Repite la nueva frase', 'new-password');
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Cambiar la frase y entrar');
  const form = h('form', {}, h('div', { class: 'field' }, h('label', { for: 'rc' }, 'Código de recuperación'), code), f1, f2, btn, err);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (p1.value.length < 12) return showError(err, 'Usa al menos 12 caracteres.');
    if (p1.value !== p2.value) return showError(err, 'Las dos frases no coinciden.');
    const done = busy(btn, 'Recuperando…');
    try {
      const { vault: updated, dek } = await C.recoverVault(vaultFile, code.value, p1.value);
      S.dek = dek;
      if (!fresh) {
        S.cred = await Auth.loadCred(dek);
        if (!S.cred) throw new Error('session_expired');
        S.repo = makeRepo();
      }
      S.vault = new Vault(S.repo, dek, { store: noteCache() });
      await S.vault.writeVaultFile(updated);
      S.vaultFile = updated;
      Auth.cacheVault(updated);
      await Auth.saveCred(dek, S.cred);
      await S.vault.loadIndex();
      notice('Frase de paso cambiada.');
      enterApp();
    } catch (e) {
      S.dek = null;
      done();
      showError(err, e);
    }
  });
  lockScreen(
    h('h1', {}, 'Recupera el acceso'),
    h('p', {}, 'Introduce tu código de recuperación y elige una frase de paso nueva.'),
    form,
    h('div', { class: 'lock-links' }, h('button', { class: 'link-btn', type: 'button', onclick: () => showUnlock(vaultFile, { fresh }) }, 'Volver')),
  );
}

async function forgetAndLogin() {
  const ok = await confirmModal('¿Olvidar este dispositivo?', 'Se borran la sesión y la copia cifrada local. Tus notas en GitHub no se tocan.', 'Olvidar');
  if (!ok) return;
  Auth.forgetDevice();
  noteCache().clear();
  wipe();
  showLogin();
}

// ---------------------------------------------------------------------------
// Bloqueo
function wipe() {
  clearTimeout(S.saveTimer);
  S.cred = null;
  S.dek = null;
  S.repo = null;
  S.vault = null;
  S.current = null;
  S.dirty = false;
  $('editor').value = '';
  cancelAnimationFrame(hlFrame);
  $('editor-hl').replaceChildren();
  $('editor-mirror').replaceChildren();
  revokeBlobs();
  $('search-input').value = '';
  $('notices').replaceChildren();
  $('search-results').replaceChildren();
  $('tag-list').replaceChildren();
  $('bookmark-list').replaceChildren();
  hidePreview();
  closeSuggest();
  $('title').value = '';
  $('breadcrumb').replaceChildren();
  document.title = 'Snowlog';
  $('modal-root').replaceChildren();
  $('menu').hidden = true;
  $('menu').replaceChildren();
  S.expanded = new Set();
  $('reading').replaceChildren();
  $('tree').replaceChildren();
  $('outline').replaceChildren();
  $('backlinks').replaceChildren();
  $('calendar').replaceChildren();
  S.notesIdx.clear();
  S.indexReady = null;
}

async function lock() {
  if (!S.vault) return;
  await saveNow();
  if (S.local) {
    wipe();
    S.local = false;
    showLocalStart();
    return;
  }
  wipe();
  const cached = Auth.cachedVault();
  if (cached) showUnlock(cached);
  else showLogin();
}

async function logout() {
  if (S.local) {
    const ok = await confirmModal('¿Olvidar esta carpeta?', 'Snowlog dejará de recordarla en este navegador. Tus ficheros no se tocan.', 'Olvidar', false);
    if (!ok) return;
    await saveNow();
    await forgetHandle();
    wipe();
    S.local = false;
    showLocalStart();
    return;
  }
  const ok = await confirmModal('¿Cerrar sesión?', 'Se bloquea Snowlog y se olvida este dispositivo. Tus notas en GitHub no se tocan.', 'Cerrar sesión');
  if (!ok) return;
  await saveNow();
  Auth.forgetDevice();
  await noteCache().clear();
  wipe();
  showLogin('Sesión cerrada.');
}

function trackActivity() {
  const mark = () => { S.lastActivity = Date.now(); };
  for (const ev of ['keydown', 'pointerdown', 'wheel', 'touchstart']) addEventListener(ev, mark, { passive: true });
  setInterval(() => {
    if (S.vault && !S.local && Date.now() - S.lastActivity > (Number(WS.lockAfterMinutes) || 10) * 60000) lock();
  }, 15000);
}

// ---------------------------------------------------------------------------
// App
async function enterApp() {
  applySettings();
  await loadExpanded();
  $('lock').hidden = true;
  $('app').hidden = false;
  S.lastActivity = Date.now();
  S.notesIdx.clear();
  S.indexReady = null;
  S.calMonth = null;
  updatePlace();
  for (const [action, label] of [['lock', S.local ? 'Cerrar carpeta' : 'Bloquear'], ['logout', S.local ? 'Olvidar esta carpeta' : 'Cerrar sesión']]) {
    const b = document.querySelector(`.ribbon [data-action=${action}]`);
    if (b) { b.title = label; b.setAttribute('aria-label', label); }
  }
  renderTree();
  setTimeout(backupReminder, 4000);
  // El índice completo (para consultas y enlaces entrantes) se carga en segundo plano.
  ensureIndex().then(() => {
    refreshBacklinks();
    if (S.mode === 'read' && S.current) runQueries();
  }).catch(() => {});
  if (WS.openDailyOnStart && WS.dailyFolder && S.vault.index.folders.includes(WS.dailyFolder)) {
    openDaily();
    return;
  }
  const last = localStorage.getItem('snowlog.last');
  const first = S.vault.notes().sort((a, b) => b.updated.localeCompare(a.updated))[0];
  const target = (last && S.vault.index.notes[last]) ? last : first?.id;
  if (target) openNote(target);
  else showEmpty();
}

// --- Índice de notas (consultas, enlaces entrantes) ---
function ensureIndex() {
  if (!S.indexReady) {
    const vault = S.vault;
    S.indexReady = (async () => {
      const ids = vault.notes().map((n) => n.id);
      let i = 0;
      S.indexProgress = { done: 0, total: ids.length };
      // Online: lo que falta se pide en bloques de 100 (GraphQL); lo que quede, uno a uno.
      if (vault.prefetch) await vault.prefetch(ids);
      const worker = async () => {
        while (i < ids.length && S.vault === vault) {
          const id = ids[i++];
          try {
            await vault.read(id);
          } catch (e) {
            // Sin conexión, las notas que no están en la caché se quedan fuera del índice por ahora.
            if (!vault.offline && !(e instanceof TypeError)) throw e;
          }
          S.indexProgress.done += 1;
        }
      };
      // Lo que ya está en la caché local sale al momento; el resto se pide a GitHub, 10 a la vez.
      await Promise.all(Array.from({ length: 10 }, worker));
      if (S.vault === vault) syncIndex();
    })();
    S.indexReady.catch(() => { S.indexReady = null; });
  }
  return S.indexReady;
}

// Pone el índice al día con lo que hay en la bóveda y en la caché descifrada.
function syncIndex() {
  if (!S.vault) return;
  const metas = S.vault.index.notes;
  for (const id of [...S.notesIdx.keys()]) if (!metas[id]) S.notesIdx.delete(id);
  for (const [id, meta] of Object.entries(metas)) {
    const text = S.vault.cache.get(id);
    if (text == null) continue;
    const old = S.notesIdx.get(id);
    if (old && old.path === meta.path && old.mtime === meta.updated && old.text === text) continue;
    S.notesIdx.set(id, parseNote({ id, path: meta.path, text, created: meta.created, updated: meta.updated }));
  }
}

const indexedNotes = () => [...S.notesIdx.values()];

function showEmpty() {
  S.current = null;
  $('note').hidden = true;
  $('empty').hidden = false;
  $('breadcrumb').replaceChildren();
  $('outline').replaceChildren(h('p', { class: 'outline-empty' }, 'Sin nota abierta'));
  $('backlinks').replaceChildren();
  setStatus('');
  $('st-words').textContent = '';
  $('st-chars').textContent = '';
  renderTree();
}

// --- Árbol ---
function buildTree() {
  const root = { folders: new Map(), notes: [] };
  const folderNode = (path) => {
    let node = root;
    let acc = '';
    for (const part of path.split('/').filter(Boolean)) {
      acc = acc ? `${acc}/${part}` : part;
      if (!node.folders.has(part)) node.folders.set(part, { path: acc, folders: new Map(), notes: [] });
      node = node.folders.get(part);
    }
    return node;
  };
  for (const f of S.vault.index.folders) folderNode(f);
  for (const n of S.vault.notes()) folderNode(parentPath(n.path)).notes.push(n);
  for (const f of S.vault.files()) folderNode(parentPath(f.path)).notes.push({ ...f, file: true });
  return root;
}

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

function renderTree() {
  const tree = $('tree');
  if (!S.vault) return;
  const frag = document.createDocumentFragment();
  const walk = (node, depth, parent) => {
    const folders = [...node.folders.values()].sort((a, b) => collator.compare(baseName(a.path), baseName(b.path)));
    for (const f of folders) {
      const open = S.expanded.has(f.path);
      const row = h('div', {
        class: `tree-row is-folder${open ? ' open' : ''}`,
        role: 'treeitem',
        tabindex: '0',
        'aria-expanded': String(open),
        'data-folder': f.path,
        html: `${icon('chevron').replace('class="icon"', 'class="icon chev"')}`,
      });
      row.append(h('span', { class: 'label' }, baseName(f.path)), moreButton());
      row.style.setProperty('--depth', depth);
      parent.append(row);
      if (open) {
        const kids = h('div', { class: 'tree-children', role: 'group' });
        parent.append(kids);
        walk(f, depth + 1, kids);
      }
    }
    const notes = node.notes.slice().sort((a, b) => collator.compare(baseName(a.path), baseName(b.path)));
    for (const n of notes) {
      if (n.file) {
        const row = h('div', { class: 'tree-row is-file', role: 'treeitem', tabindex: '0', 'data-file': n.id },
          h('span', { class: 'spacer' }), h('span', { class: 'label' }, baseName(n.path).replace(/\.[^.]+$/, '')),
          h('span', { class: 'file-ext' }, extOf(n.path)), moreButton());
        row.style.setProperty('--depth', depth);
        parent.append(row);
        continue;
      }
      const row = h('div', {
        class: `tree-row is-note${n.id === S.current ? ' active' : ''}`,
        role: 'treeitem',
        tabindex: '0',
        draggable: 'true',
        'data-note': n.id,
        'aria-selected': String(n.id === S.current),
      }, h('span', { class: 'spacer' }), h('span', { class: 'label' }, baseName(n.path)), moreButton());
      row.style.setProperty('--depth', depth);
      parent.append(row);
    }
  };
  walk(buildTree(), 0, frag);
  if (!frag.childNodes.length) frag.append(h('p', { class: 'tree-empty' }, 'Aún no hay notas.'));
  tree.replaceChildren(frag);
  syncIndex();
  renderCalendar();
}

function moreButton() {
  return h('button', { class: 'icon-btn row-more', type: 'button', 'aria-label': 'Opciones', tabindex: '-1', html: icon('more') });
}

// Carpetas abiertas en el explorador. En online sus nombres se guardan cifrados con la DEK
// (no deben quedar en claro en el navegador); en local ya están en claro en el disco.
const EXPANDED_KEY = () => (S.local ? 'snowlog.expanded.local' : 'snowlog.expanded.enc');
async function saveExpanded() {
  const list = JSON.stringify([...S.expanded]);
  try {
    if (S.local) localStorage.setItem(EXPANDED_KEY(), list);
    else if (S.dek) localStorage.setItem(EXPANDED_KEY(), await C.encryptText(S.dek, list, 'expanded'));
  } catch { /* sin almacenamiento */ }
}
async function loadExpanded() {
  S.expanded = new Set();
  try {
    localStorage.removeItem('snowlog.expanded'); // formato antiguo, en claro
    const raw = localStorage.getItem(EXPANDED_KEY());
    if (!raw) return;
    S.expanded = new Set(JSON.parse(S.local ? raw : await C.decryptText(S.dek, raw, 'expanded')));
  } catch { /* de otra clave o dañado: se empieza con todo plegado */ }
}

function toggleFolder(path) {
  if (S.expanded.has(path)) S.expanded.delete(path);
  else S.expanded.add(path);
  saveExpanded();
  renderTree();
}

function expandTo(path) {
  const parts = parentPath(path).split('/').filter(Boolean);
  for (let i = 1; i <= parts.length; i++) S.expanded.add(parts.slice(0, i).join('/'));
  saveExpanded();
}

function setupTree() {
  const tree = $('tree');
  tree.addEventListener('click', (ev) => {
    const row = ev.target.closest('.tree-row');
    if (!row) return;
    if (ev.target.closest('.row-more')) {
      const r = ev.target.closest('.row-more').getBoundingClientRect();
      return rowMenu(row, r.left, r.bottom);
    }
    if (row.dataset.folder) toggleFolder(row.dataset.folder);
    else if (row.dataset.file) openAttachment(row.dataset.file);
    else openNote(row.dataset.note);
  });
  tree.addEventListener('keydown', (ev) => {
    const row = ev.target.closest('.tree-row');
    if (!row) return;
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      row.click();
    } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const rows = [...tree.querySelectorAll('.tree-row')];
      const next = rows[rows.indexOf(row) + (ev.key === 'ArrowDown' ? 1 : -1)];
      if (next) next.focus();
    } else if (ev.key === 'F2') {
      ev.preventDefault();
      if (row.dataset.note) renameNotePrompt(row.dataset.note);
      else renameFolderPrompt(row.dataset.folder);
    }
  });
  tree.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    const row = ev.target.closest('.tree-row');
    if (row) rowMenu(row, ev.clientX, ev.clientY);
    else openMenu(ev.clientX, ev.clientY, [
      ['filePlus', 'Nueva nota', () => newNote('')],
      ['folderPlus', 'Nueva carpeta', () => newFolder('')],
    ]);
  });

  // Arrastrar notas a carpetas (o a la raíz)
  let dragId = null;
  tree.addEventListener('dragstart', (ev) => {
    const row = ev.target.closest('.tree-row.is-note');
    if (!row) return;
    dragId = row.dataset.note;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', baseName(S.vault.index.notes[dragId].path));
  });
  const clearDrop = () => {
    tree.classList.remove('drop-root');
    tree.querySelectorAll('.drop').forEach((r) => r.classList.remove('drop'));
  };
  tree.addEventListener('dragover', (ev) => {
    if (!dragId) return;
    ev.preventDefault();
    clearDrop();
    const row = ev.target.closest('.tree-row.is-folder');
    if (row) row.classList.add('drop');
    else tree.classList.add('drop-root');
  });
  tree.addEventListener('dragleave', (ev) => {
    if (!tree.contains(ev.relatedTarget)) clearDrop();
  });
  tree.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    clearDrop();
    if (!dragId) return;
    const id = dragId;
    dragId = null;
    const row = ev.target.closest('.tree-row.is-folder');
    const folder = row ? row.dataset.folder : '';
    const note = S.vault.index.notes[id];
    if (!note || parentPath(note.path) === folder) return;
    await moveNote(id, folder);
  });
  tree.addEventListener('dragend', () => {
    dragId = null;
    clearDrop();
  });
}

function rowMenu(row, x, y) {
  if (row.dataset.file) {
    const id = row.dataset.file;
    openMenu(x, y, [
      ['read', 'Abrir', () => openAttachment(id)],
      ['import', 'Insertar en la nota', () => insertEmbed(S.vault.index.files[id].path)],
      null,
      ['trash', 'Eliminar', () => deleteAttachment(id), 'danger'],
    ]);
    return;
  }
  if (row.dataset.note) {
    const id = row.dataset.note;
    openMenu(x, y, [
      ['rename', 'Renombrar', () => renameNotePrompt(id)],
      ['move', 'Mover a…', () => moveNotePrompt(id)],
      ['bookmark', isBookmarked(id) ? 'Quitar de marcadores' : 'Añadir a marcadores', () => toggleBookmark(id)],
      null,
      ['trash', 'Eliminar', () => deleteNote(id), 'danger'],
    ]);
  } else {
    const path = row.dataset.folder;
    openMenu(x, y, [
      ['filePlus', 'Nueva nota', () => newNote(path)],
      ['folderPlus', 'Nueva carpeta', () => newFolder(path)],
      ['rename', 'Renombrar', () => renameFolderPrompt(path)],
      null,
      ['trash', 'Eliminar', () => deleteFolder(path), 'danger'],
    ]);
  }
}

// --- Menú contextual ---
function openMenu(x, y, items) {
  const menu = $('menu');
  menu.replaceChildren(...items.map((it) => {
    if (!it) return h('div', { class: 'menu-sep', role: 'separator' });
    const [ic, label, fn, kind] = it;
    return h('button', {
      class: `menu-item${kind ? ` ${kind}` : ''}`,
      role: 'menuitem',
      type: 'button',
      html: icon(ic),
      onclick: () => { closeMenu(); fn(); },
    }, label);
  }));
  menu.style.maxHeight = '';
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  // Debajo de donde se abrió, sin tapar el botón: si no cabe entero, con su propio scroll.
  const below = innerHeight - y - 8;
  if (r.height <= below || below >= 240) {
    menu.style.top = `${y}px`;
    menu.style.maxHeight = `${below}px`;
  } else {
    menu.style.top = `${Math.max(8, innerHeight - r.height - 8)}px`;
  }
  menu.querySelector('.menu-item')?.focus();
}
function closeMenu() {
  $('menu').hidden = true;
}

// --- Modales ---
function modal(build) {
  return new Promise((resolve) => {
    const root = $('modal-root');
    const prevFocus = document.activeElement;
    const close = (value) => {
      root.replaceChildren();
      document.removeEventListener('keydown', onKey, true);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(value);
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        close(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    const box = build(close);
    root.replaceChildren(box);
    root.onclick = (ev) => { if (ev.target === root) close(null); };
    (box.querySelector('input') || box.querySelector('button.primary, button.danger'))?.focus();
  });
}

function promptModal(title, label, value = '', okText = 'Aceptar', hint = '') {
  return modal((close) => {
    const input = h('input', { class: 'input', id: 'mp', value, autocomplete: 'off', spellcheck: 'false' });
    const form = h('form', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('h2', {}, title),
      hint ? h('p', {}, hint) : null,
      h('div', { class: 'field' }, h('label', { for: 'mp' }, label), input),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancelar'),
        h('button', { class: 'btn primary', type: 'submit' }, okText)));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      close(input.value);
    });
    setTimeout(() => input.select(), 0);
    return form;
  });
}

function confirmModal(title, text, okText = 'Aceptar', danger = true) {
  return modal((close) => h('div', { class: 'modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
    h('h2', {}, title),
    h('p', {}, text),
    h('div', { class: 'modal-actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'Cancelar'),
      h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', onclick: () => close(true) }, okText))))
    .then((v) => v === true);
}

function quickSwitcher() {
  if (!S.vault) return;
  modal((close) => {
    const input = h('input', { class: 'input', placeholder: 'Busca una nota o escribe un título nuevo…', 'aria-label': 'Buscar nota', autocomplete: 'off', spellcheck: 'false' });
    const list = h('div', { class: 'switcher-list', role: 'listbox' });
    let items = [];
    let sel = 0;
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const notes = S.vault.notes()
        .filter((n) => !q || n.path.toLowerCase().includes(q))
        .sort((a, b) => (q ? baseName(a.path).toLowerCase().indexOf(q) - baseName(b.path).toLowerCase().indexOf(q) : 0) || b.updated.localeCompare(a.updated))
        .slice(0, 50);
      items = notes.map((n) => ({ id: n.id, title: baseName(n.path), sub: parentPath(n.path) }));
      if (q && !S.vault.findByPath(input.value)) items.push({ create: input.value.trim(), title: `Crear «${input.value.trim()}»`, sub: 'Nota nueva' });
      sel = Math.min(sel, Math.max(0, items.length - 1));
      list.replaceChildren(...items.map((it, i) => h('button', {
        class: `switcher-item${i === sel ? ' sel' : ''}`,
        type: 'button',
        role: 'option',
        'aria-selected': String(i === sel),
        onclick: () => pick(i),
      }, h('span', {}, it.title), it.sub ? h('span', { class: 'sub' }, it.sub) : null)));
      list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    };
    const pick = async (i) => {
      const it = items[i];
      if (!it) return;
      close(null);
      if (it.create) await newNoteAt(it.create);
      else openNote(it.id);
    };
    input.addEventListener('input', () => { sel = 0; draw(); });
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); sel = Math.min(sel + 1, items.length - 1); draw(); }
      if (ev.key === 'ArrowUp') { ev.preventDefault(); sel = Math.max(sel - 1, 0); draw(); }
      if (ev.key === 'Enter') { ev.preventDefault(); pick(sel); }
    });
    draw();
    return h('div', { class: 'modal switcher', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Abrir nota' },
      input, list, h('div', { class: 'switcher-hint' }, '↑↓ para moverte · Intro para abrir · Esc para cerrar'));
  });
}

// --- Operaciones ---
async function run(fn, okText) {
  try {
    const r = await fn();
    if (okText) notice(okText);
    return r;
  } catch (e) {
    notice(errText(e), 'error');
    return undefined;
  }
}

async function newNote(folder = currentFolder()) {
  await saveNow();
  const path = S.vault.freePath(folder);
  const id = await run(() => S.vault.createNote(path, ''));
  if (!id) return;
  expandTo(path);
  await openNote(id, { focusTitle: true });
}

async function newNoteAt(path) {
  await saveNow();
  const id = await run(() => S.vault.createNote(path, ''));
  if (!id) return;
  expandTo(normalizePath(path));
  await openNote(id);
}

function currentFolder() {
  const n = S.current && S.vault.index.notes[S.current];
  return n ? parentPath(n.path) : '';
}

async function newFolder(parent = '') {
  const name = await promptModal('Nueva carpeta', 'Nombre', '', 'Crear');
  if (!name) return;
  const path = normalizePath(`${parent}/${name}`);
  const ok = await run(() => S.vault.createFolder(path).then(() => true));
  if (!ok) return;
  S.expanded.add(path);
  expandTo(path);
  renderTree();
}

async function renameNotePrompt(id) {
  const note = S.vault.index.notes[id];
  if (!note) return;
  const name = await promptModal('Renombrar nota', 'Nombre', baseName(note.path), 'Renombrar');
  if (name == null || name.trim() === baseName(note.path)) return;
  await renameNoteTo(id, normalizePath(`${parentPath(note.path)}/${name}`));
}

async function renameNoteTo(id, path) {
  await saveNow();
  const from = S.vault.index.notes[id]?.path;
  const allPaths = S.vault.notes().map((n) => n.path);
  const ok = await run(() => S.vault.renameNote(id, path).then(() => true));
  renderTree();
  if (id === S.current) updateHeader();
  if (ok && from && from !== S.vault.index.notes[id].path) {
    await updateLinks([{ from, to: S.vault.index.notes[id].path }], allPaths);
  }
  return ok;
}

// Tras renombrar o mover, reescribe los [[enlaces]] de todas las notas que apuntaban a lo movido.
async function updateLinks(moves, allPaths) {
  await moveBookmarks(moves);
  try {
    await ensureIndex();
    const changes = linkChanges(moves, allPaths);
    const updates = [];
    for (const n of S.vault.notes()) {
      const text = await S.vault.read(n.id);
      const next = rewriteLinks(text, changes);
      if (next != null) updates.push({ id: n.id, text: next });
    }
    if (!updates.length) return;
    await S.vault.saveMany(updates, 'actualizar enlaces');
    const mine = updates.find((u) => u.id === S.current);
    if (mine && !S.dirty) {
      $('editor').value = mine.text;
      autosize();
      if (S.mode === 'read') setMode('read');
    }
    syncIndex();
    refreshBacklinks();
    notice(`Enlaces actualizados en ${updates.length} nota${updates.length === 1 ? '' : 's'}.`);
  } catch (e) {
    notice(`La nota se ha renombrado, pero no se pudieron actualizar los enlaces: ${errText(e)}`, 'error');
  }
}

async function moveNotePrompt(id) {
  const note = S.vault.index.notes[id];
  const folder = await promptModal('Mover nota', 'Carpeta de destino', parentPath(note.path), 'Mover', 'Escribe la ruta de la carpeta, por ejemplo «Trabajo/Ideas». Déjalo vacío para la raíz.');
  if (folder == null) return;
  await moveNote(id, normalizePath(folder));
}

async function moveNote(id, folder) {
  const note = S.vault.index.notes[id];
  const ok = await renameNoteTo(id, normalizePath(`${folder}/${baseName(note.path)}`));
  if (ok) {
    expandTo(S.vault.index.notes[id].path);
    renderTree();
  }
}

async function deleteNote(id) {
  const note = S.vault.index.notes[id];
  if (!note) return;
  const ok = await confirmModal('Eliminar nota', `¿Eliminar «${baseName(note.path)}»? Podrás recuperarla desde el historial del repo.`, 'Eliminar');
  if (!ok) return;
  if (id === S.current) {
    clearTimeout(S.saveTimer);
    S.dirty = false;
  }
  const done = await run(() => S.vault.deleteNote(id).then(() => true), 'Nota eliminada');
  if (!done) return;
  if (id === S.current) showEmpty();
  else renderTree();
}

async function renameFolderPrompt(path) {
  const name = await promptModal('Renombrar carpeta', 'Nombre', baseName(path), 'Renombrar');
  if (name == null || name.trim() === baseName(path)) return;
  const to = normalizePath(`${parentPath(path)}/${name}`);
  await saveNow();
  const allPaths = S.vault.notes().map((n) => n.path);
  const moves = S.vault.notesUnder(path).map((n) => ({ from: n.path, to: to + n.path.slice(path.length) }));
  const ok = await run(() => S.vault.renameFolder(path, to).then(() => true));
  if (ok) {
    if (S.expanded.delete(path)) S.expanded.add(to);
    renderTree();
    if (S.current) updateHeader();
    if (moves.length) await updateLinks(moves, allPaths);
  }
}

async function deleteFolder(path) {
  const count = S.vault.notesUnder(path).length;
  const ok = await confirmModal('Eliminar carpeta', count
    ? `¿Eliminar «${baseName(path)}» y sus ${count} nota${count === 1 ? '' : 's'}? Podrás recuperarlas desde el historial del repo.`
    : `¿Eliminar la carpeta vacía «${baseName(path)}»?`, 'Eliminar');
  if (!ok) return;
  const inside = S.current && S.vault.index.notes[S.current]?.path.startsWith(`${path}/`);
  if (inside) {
    clearTimeout(S.saveTimer);
    S.dirty = false;
  }
  const done = await run(() => S.vault.deleteFolder(path).then(() => true), 'Carpeta eliminada');
  if (!done) return;
  if (inside) showEmpty();
  else renderTree();
}

// --- Abrir y editar ---
async function openNote(id, { focusTitle = false } = {}) {
  if (!S.vault.index.notes[id]) return;
  await saveNow();
  closeMobilePanels();
  S.current = id;
  try { localStorage.setItem('snowlog.last', id); } catch { /* sin almacenamiento */ }
  expandTo(S.vault.index.notes[id].path);
  renderTree();
  $('empty').hidden = true;
  $('note').hidden = false;
  updateHeader();
  setStatus('loading');
  const editor = $('editor');
  editor.value = '';
  editor.disabled = true;
  try {
    const text = await S.vault.read(id);
    if (S.current !== id) return;
    editor.value = text;
    setStatus('saved');
  } catch (e) {
    setStatus('error');
    notice(errText(e), 'error');
  } finally {
    editor.disabled = false;
  }
  setMode(S.mode);
  refreshSide();
  autosize();
  if (focusTitle) {
    $('title').focus();
    $('title').select();
  } else if (S.mode === 'edit' && !isMobile()) {
    editor.focus();
    editor.setSelectionRange(0, 0);
  }
  $('view').scrollTop = 0;
}

function updateHeader() {
  const note = S.vault.index.notes[S.current];
  if (!note) return;
  if (document.activeElement !== $('title')) $('title').value = baseName(note.path);
  const parts = note.path.split('/');
  $('breadcrumb').replaceChildren(...parts.flatMap((p, i) => [
    i ? h('span', { class: 'crumb-sep' }, '/') : null,
    h('span', { class: i === parts.length - 1 ? 'crumb-last' : '' }, p),
  ]).filter(Boolean));
  document.title = `${baseName(note.path)} · Snowlog`;
}

function setMode(mode) {
  S.mode = mode;
  const reading = mode === 'read';
  $('editor-wrap').hidden = reading;
  if (reading) closeSuggest();
  $('reading').hidden = !reading;
  if (reading) {
    const text = $('editor').value;
    const view = $('reading');
    if (K.isBoard(text)) {
      renderBoard(view, text);
      return finishMode(reading);
    }
    view.innerHTML = trusted(render(text, { frontmatter: true }));
    applyCssClasses(view, text);
    enableOwnTasks(view, text);
    fillEmbeds(view);
    runQueries();
  }
  finishMode(reading);
}

function finishMode(reading) {
  const btn = $('mode-btn');
  btn.innerHTML = trusted(icon(reading ? 'edit' : 'read'));
  btn.setAttribute('aria-label', reading ? 'Cambiar a edición (Ctrl+E)' : 'Cambiar a lectura (Ctrl+E)');
  btn.title = reading ? 'Editar (Ctrl+E)' : 'Lectura (Ctrl+E)';
  if (!reading) autosize();
}

function autosize() {
  const ed = $('editor');
  ed.style.height = 'auto';
  ed.style.height = `${Math.max(ed.scrollHeight, 200)}px`;
  paintHighlight();
}

// Resaltado: un <pre> detrás del cuadro de texto con el mismo texto coloreado.
// highlight() escapa todo el texto antes de añadir sus <span>.
let hlFrame = 0;
function paintHighlight() {
  cancelAnimationFrame(hlFrame);
  hlFrame = requestAnimationFrame(() => {
    $('editor-hl').innerHTML = trusted(`${Ed.highlight($('editor').value)}\n`);
  });
}

// Aplica una edición de editor.js conservando el deshacer del navegador.
function applyEdit(e) {
  const ed = $('editor');
  ed.focus();
  ed.setSelectionRange(e.start, e.end);
  const ok = e.insert
    ? document.execCommand('insertText', false, e.insert)
    : (e.start === e.end || document.execCommand('delete'));
  if (!ok) {
    ed.setRangeText(e.insert, e.start, e.end, 'end');
    ed.dispatchEvent(new Event('input'));
  }
  ed.setSelectionRange(e.selStart, e.selEnd);
}

// --- Autocompletar [[enlaces ---
const SG = { q: null, items: [], sel: 0 };

function closeSuggest() {
  SG.q = null;
  $('suggest').hidden = true;
}

function caretBox(pos) {
  const ed = $('editor');
  const mirror = $('editor-mirror');
  mirror.innerHTML = trusted(`${escapeHtml(ed.value.slice(0, pos))}<span id="caret-mark">\u200b</span>`);
  const mark = mirror.querySelector('#caret-mark');
  return { left: mark.offsetLeft, top: mark.offsetTop + mark.offsetHeight };
}

function updateSuggest() {
  const ed = $('editor');
  const pos = ed.selectionStart;
  const q = ed.selectionStart === ed.selectionEnd && Ed.linkQuery(ed.value, pos);
  if (!q) return closeSuggest();
  const items = Ed.suggestNotes(S.vault.notes().filter((n) => n.id !== S.current), q.query);
  const name = q.query.trim();
  if (name && !items.some((it) => it.name.toLowerCase() === baseName(name).toLowerCase())) items.push({ create: true, name });
  if (!items.length) return closeSuggest();
  SG.q = q;
  SG.items = items;
  SG.sel = Math.min(SG.sel, items.length - 1);
  const box = $('suggest');
  box.replaceChildren(...items.map((it, i) => h('div', {
    class: `suggest-item${i === SG.sel ? ' selected' : ''}`,
    role: 'option',
    'aria-selected': String(i === SG.sel),
    onpointerdown: (ev) => { ev.preventDefault(); pickSuggest(i); },
  }, it.create
    ? [h('span', { class: 'suggest-name' }, `Crear «${it.name}»`)]
    : [h('span', { class: 'suggest-name' }, it.name), it.path !== it.name ? h('span', { class: 'suggest-path' }, parentPath(it.path)) : null].filter(Boolean))));
  const c = caretBox(q.start);
  box.style.left = `${Math.min(c.left, Math.max(0, ed.clientWidth - 280))}px`;
  box.style.top = `${c.top + 4}px`;
  box.hidden = false;
  box.children[SG.sel]?.scrollIntoView({ block: 'nearest' });
}

async function pickSuggest(i) {
  const it = SG.items[i];
  const q = SG.q;
  if (!it || !q) return;
  closeSuggest();
  const ed = $('editor');
  const pos = ed.selectionStart;
  const exists = !it.create || S.vault.findByTitle(baseName(it.name)) || S.vault.findByPath(it.name);
  // Si el nombre es único basta con él; si no, se enlaza con la ruta.
  const target = it.create ? it.name : (S.vault.notes().filter((n) => baseName(n.path).toLowerCase() === it.name.toLowerCase()).length > 1 ? it.path : it.name);
  applyEdit(Ed.completeLink(ed.value, pos, q, target));
  if (exists) return;
  try {
    await S.vault.createNote(normalizePath(it.name), '');
    renderTree();
    syncIndex();
    notice(`Nota «${baseName(it.name)}» creada.`);
  } catch (e) {
    notice(`No se pudo crear la nota: ${errText(e)}`, 'error');
  }
}

function editorKeydown(ev) {
  const ed = ev.currentTarget;
  const mod = ev.ctrlKey || ev.metaKey;
  if (SG.q && !$('suggest').hidden) {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      SG.sel = (SG.sel + (ev.key === 'ArrowDown' ? 1 : -1) + SG.items.length) % SG.items.length;
      updateSuggest();
      return;
    }
    if ((ev.key === 'Enter' || ev.key === 'Tab') && !mod && !ev.shiftKey) {
      ev.preventDefault();
      pickSuggest(SG.sel);
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      closeSuggest();
      return;
    }
  }
  if (ev.isComposing || ev.altKey) return;
  const { value, selectionStart: s, selectionEnd: e } = ed;
  let edit = null;
  if (ev.key === 'Enter' && !mod && !ev.shiftKey) edit = Ed.continueList(value, s, e);
  else if (ev.key === 'Tab' && !mod) {
    edit = Ed.indentLines(value, s, e, ev.shiftKey);
    if (!edit && !ev.shiftKey) edit = { start: s, end: e, insert: '\t', selStart: s + 1, selEnd: s + 1 };
    ev.preventDefault();
  } else if (mod && !ev.shiftKey) {
    const k = ev.key.toLowerCase();
    if (k === 'b') edit = Ed.toggleWrap(value, s, e, '**');
    else if (k === 'i') edit = Ed.toggleWrap(value, s, e, '*');
    else if (k === 'k') edit = Ed.insertLink(value, s, e);
    else if (ev.key === 'Enter') edit = Ed.toggleTask(value, s);
  }
  if (!edit) return;
  ev.preventDefault();
  ev.stopPropagation();
  applyEdit(edit);
}

let sideTimer = null;
function refreshSide() {
  const text = $('editor').value;
  $('st-words').textContent = `${wordCount(text).toLocaleString('es')} palabras`;
  $('st-chars').textContent = `${text.length.toLocaleString('es')} caracteres`;
  const heads = outline(text);
  $('outline').replaceChildren(...(heads.length
    ? heads.map((hd, i) => {
      const b = h('button', { class: 'outline-item', type: 'button', title: hd.text, onclick: () => jumpTo(hd, i) }, hd.text);
      b.style.setProperty('--level', hd.level - 1);
      return b;
    })
    : [h('p', { class: 'outline-empty' }, 'Sin encabezados')]));
  refreshBacklinks();
}

function jumpTo(head, index) {
  closeMobilePanels();
  if (S.mode === 'read') {
    $('reading').querySelectorAll('h1,h2,h3,h4,h5,h6')[index]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return;
  }
  const ed = $('editor');
  const lines = ed.value.split('\n');
  const pos = lines.slice(0, head.line).reduce((acc, l) => acc + l.length + 1, 0);
  ed.focus();
  ed.setSelectionRange(pos, pos);
  const lineHeight = parseFloat(getComputedStyle(ed).lineHeight) || 26;
  $('view').scrollTop = ed.offsetTop + head.line * lineHeight - 40;
}

// La nota cambió también en otro sitio: se guardó esta versión y la otra quedó en una copia.
// Dónde están las notas, y si falta conexión, cuántos cambios esperan a subirse.
function updatePlace() {
  const el = $('st-place');
  if (!S.vault) return;
  if (S.local) {
    el.textContent = S.vault.kind === 'folder' ? `Carpeta «${S.vault.label}»` : 'En este navegador';
    el.className = '';
    return;
  }
  const n = S.vault.outbox.size;
  el.textContent = S.vault.offline
    ? `Sin conexión${n ? ` · ${n} cambio${n === 1 ? '' : 's'} por subir` : ''}`
    : (n ? `Subiendo ${n} cambio${n === 1 ? '' : 's'}…` : 'GitHub · cifrado');
  el.className = S.vault.offline ? 'offline' : '';
}

// Carpeta del ordenador: mirar si algo cambió desde fuera (otro editor, OneDrive, Dropbox…).
let rescanning = false;
async function rescanLocal() {
  if (!S.local || S.vault?.kind !== 'folder' || rescanning || document.hidden) return;
  rescanning = true;
  const vault = S.vault;
  try {
    const res = await vault.rescan();
    if (S.vault !== vault || !(res.added.length || res.removed.length || res.changed.length)) return;
    const cur = S.current;
    if (cur && res.removed.includes(cur)) {
      const text = $('editor').value;
      S.current = null;
      if (S.dirty) {
        // La borraron o movieron fuera mientras se escribía: no se pierde lo escrito.
        const path = vault.freePath('', 'Recuperada');
        const id = await vault.createNote(path, text);
        S.dirty = false;
        notice(`La nota se borró o se movió fuera de Snowlog. Lo que estabas escribiendo está en «${path}».`, 'error');
        await openNote(id);
      } else {
        notice('La nota que tenías abierta se ha borrado o movido fuera de Snowlog.');
        showEmpty();
      }
    } else if (cur && res.changed.includes(cur) && !S.dirty) {
      const text = await vault.read(cur);
      if (S.current === cur && !S.dirty) {
        $('editor').value = text;
        autosize();
        if (S.mode === 'read') setMode('read');
        refreshSide();
        notice('La nota ha cambiado fuera de Snowlog y se ha actualizado.');
      }
    }
    renderTree();
    syncIndex();
    S.indexReady = null;
    ensureIndex().catch(() => {});
  } catch { /* la carpeta puede no estar accesible un momento */ } finally {
    rescanning = false;
  }
}

// Cuando vuelve la red: recarga el índice y sube lo que se escribió sin conexión.
let syncing = null;
function trySync() {
  if (!S.vault || S.local || syncing) return syncing;
  const vault = S.vault;
  syncing = (async () => {
    try {
      await saveNow();
      const res = await vault.sync();
      if (S.vault !== vault) return;
      for (const c of res.conflicts) reportConflict(c);
      if (res.synced) notice(`Conexión recuperada: ${res.synced} cambio${res.synced === 1 ? '' : 's'} subido${res.synced === 1 ? '' : 's'}.`);
      if (S.current && !S.dirty && vault.index.notes[S.current]) {
        const text = await vault.read(S.current);
        if (!S.dirty && S.vault === vault && $('editor').value !== text) {
          $('editor').value = text;
          autosize();
          if (S.mode === 'read') setMode('read');
        }
      }
      renderTree();
      syncIndex();
      S.indexReady = null;
      ensureIndex().catch(() => {});
    } catch (e) {
      if (e.message !== 'offline') notice(`No se pudo sincronizar: ${errText(e)}`, 'error');
    } finally {
      syncing = null;
      updatePlace();
    }
  })();
  return syncing;
}

// Al guardar se han juntado los cambios de aquí con los de otro dispositivo: el editor pasa a mostrar
// el resultado (y si mientras tanto se ha seguido escribiendo, también se junta con eso).
function applyMerged(id, sent, merged) {
  if (S.current !== id) return;
  const ed = $('editor');
  const now = ed.value;
  let next = merged;
  if (now !== sent) {
    const m = merge3(sent, now, merged);
    if (m.conflict) return; // lo que se está escribiendo choca: se resolverá al guardar
    next = m.text;
    S.dirty = true;
    scheduleSave();
  }
  const pos = ed.selectionStart;
  ed.value = next;
  if (document.activeElement === ed) ed.setSelectionRange(Math.min(pos, next.length), Math.min(pos, next.length));
  autosize();
  if (S.mode === 'read') setMode('read');
  clearTimeout(sideTimer);
  sideTimer = setTimeout(refreshSide, 300);
  notice('Se han juntado tus cambios con los que se hicieron en otro sitio.');
}

function reportConflict(conflict) {
  if (S.vault?.index.notes[conflict.id]) expandTo(conflict.path);
  renderTree();
  const n = h('div', { class: 'notice' },
    'Esta nota también se cambió en otro dispositivo. Se ha guardado tu versión y la otra está en ',
    h('button', { class: 'link-btn', type: 'button', onclick: () => { n.remove(); openNote(conflict.id); } }, `«${baseName(conflict.path)}»`),
    '.');
  $('notices').append(n);
  setTimeout(() => n.remove(), 20000);
}

function setStatus(kind) {
  const el = $('st-sync');
  const text = {
    loading: 'Descifrando…', queued: 'Guardado aquí (sin conexión)', pending: 'Sin guardar', saving: 'Cifrando y guardando…', saved: 'Guardado', error: 'Error al guardar', '': '',
  }[kind];
  el.textContent = text;
  el.className = kind === 'error' ? 'error' : '';
}

function scheduleSave() {
  S.dirty = true;
  setStatus('pending');
  clearTimeout(S.saveTimer);
  const now = Date.now();
  if (!S.dirtySince) S.dirtySince = now;
  const idle = S.local ? CONFIG.localSaveDelayMs : CONFIG.saveDelayMs;
  S.saveTimer = setTimeout(saveNow, Math.max(0, Math.min(idle, S.dirtySince + CONFIG.saveMaxWaitMs - now)));
}

function saveNow() {
  clearTimeout(S.saveTimer);
  S.dirtySince = 0;
  if (!S.dirty || !S.current || !S.vault) return S.saving;
  const id = S.current;
  const text = $('editor').value;
  const vault = S.vault;
  S.dirty = false;
  setStatus('saving');
  S.saving = S.saving
    .then(() => vault.saveNote(id, text))
    .then((res) => {
      if (res?.merged != null) applyMerged(id, text, res.merged);
      if (res?.conflict) reportConflict(res.conflict);
      if (!S.dirty && S.current === id) setStatus(res?.queued ? 'queued' : 'saved');
      updatePlace();
      syncIndex();
      renderCalendar();
    })
    .catch((e) => {
      if (S.current === id) {
        S.dirty = true;
        setStatus('error');
      }
      notice(`No se pudo guardar: ${errText(e)}`, 'error');
    });
  return S.saving;
}

async function commitTitle() {
  const id = S.current;
  const note = id && S.vault.index.notes[id];
  if (!note) return;
  const name = $('title').value.trim();
  if (!name || name === baseName(note.path)) {
    $('title').value = baseName(note.path);
    return;
  }
  const ok = await renameNoteTo(id, normalizePath(`${parentPath(note.path)}/${name}`));
  if (!ok) $('title').value = baseName(S.vault.index.notes[id].path);
}

async function openByTitle(title) {
  const hit = S.vault.findByTitle(title);
  if (hit) return openNote(hit.id);
  return newNoteAt(title);
}

// --- Lectura enriquecida: cssclasses, tareas que se pueden marcar y consultas ---
function applyCssClasses(view, text) {
  view.className = 'reading markdown';
  const fm = (text.match(/^---\n[\s\S]*?\n---/) && parseNote({ id: '', path: 'x', text }).fm) || {};
  const raw = fm.cssclasses ?? fm.cssclass ?? [];
  for (const c of (Array.isArray(raw) ? raw : String(raw).split(/[\s,]+/))) {
    const name = String(c).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (name) view.classList.add(`cs-${name}`);
  }
}

// Las casillas de la propia nota se corresponden, en orden, con las líneas de tarea del texto.
function enableOwnTasks(view, text) {
  const boxes = [...view.querySelectorAll('li.task > input[type=checkbox]')];
  const lines = contentLines(text).filter((l) => TASK_LINE_RE.test(l.value));
  if (boxes.length !== lines.length) return;
  boxes.forEach((box, i) => {
    box.disabled = false;
    box.classList.add('task-checkbox');
    box.dataset.line = String(lines[i].line);
    box.setAttribute('aria-label', 'Marcar tarea');
  });
}

async function runQueries() {
  const view = $('reading');
  const blocks = [...view.querySelectorAll('pre > code.language-dataview, pre > code.language-query')];
  if (!blocks.length) return;
  const id = S.current;
  const placeholders = blocks.map((code) => {
    const box = h('div', { class: 'query', 'data-source': code.textContent }, h('p', { class: 'query-empty' }, 'Cargando…'));
    code.parentElement.replaceWith(box);
    return box;
  });
  try {
    await ensureIndex();
  } catch (e) {
    placeholders.forEach((b) => b.replaceChildren(h('p', { class: 'query-error' }, errText(e))));
    return;
  }
  if (S.current !== id || S.mode !== 'read') return;
  renderQueryBoxes(view);
}

function renderQueryBoxes(view) {
  const exclude = [WS.templatesFolder].filter(Boolean);
  for (const box of view.querySelectorAll('div.query')) {
    try {
      const res = runQuery(parseQuery(box.dataset.source), indexedNotes(), { exclude });
      box.innerHTML = trusted(renderResult(res));
    } catch (e) {
      box.replaceChildren(h('p', { class: 'query-error' }, `Consulta: ${e.message}`));
    }
  }
}

async function toggleTask(box) {
  const line = Number(box.dataset.line);
  const done = box.checked;
  const target = box.dataset.note || S.current;
  box.disabled = true;
  try {
    if (target === S.current) {
      const text = toggleTaskLine($('editor').value, line, done);
      if (text == null) throw new Error('La tarea ha cambiado; recarga la nota.');
      $('editor').value = text;
      autosize();
      S.dirty = true;
      await saveNow();
      syncIndex();
      if (box.dataset.note) setMode('read');
    } else {
      const text = toggleTaskLine(await S.vault.read(target), line, done);
      if (text == null) throw new Error('La tarea ha cambiado; recarga la nota.');
      const res = await S.vault.saveNote(target, text);
      if (res?.conflict) reportConflict(res.conflict);
      syncIndex();
    }
    box.closest('li')?.classList.toggle('done', done);
    if (S.mode === 'read') renderQueryBoxes($('reading'));
  } catch (e) {
    box.checked = !done;
    notice(e.message || errText(e), 'error');
  } finally {
    box.disabled = false;
  }
}

// --- Enlaces entrantes ---
function refreshBacklinks() {
  const el = $('backlinks');
  const me = S.current && S.notesIdx.get(S.current);
  if (!S.current) {
    el.replaceChildren();
    return;
  }
  if (!S.indexReady || !me) {
    el.replaceChildren(h('p', { class: 'outline-empty' }, 'Buscando…'));
    return;
  }
  const from = indexedNotes().filter((n) => n.id !== me.id && linksTo(n, me));
  el.replaceChildren(...(from.length
    ? from.sort((a, b) => a.name.localeCompare(b.name, 'es')).map((n) => h('button', {
      class: 'outline-item', type: 'button', title: n.path, onclick: () => openNote(n.id),
    }, n.name))
    : [h('p', { class: 'outline-empty' }, 'Ninguna nota enlaza aquí')]));
}

// --- Calendario ---
function renderCalendar() {
  const el = $('calendar');
  if (!S.vault || !el) return;
  const today = new Date();
  if (!S.calMonth) S.calMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const y = S.calMonth.getFullYear();
  const m = S.calMonth.getMonth();
  const prefix = WS.dailyFolder ? `${WS.dailyFolder}/` : '';
  const days = new Set(S.vault.notes()
    .filter((n) => n.path.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}$/.test(n.path.slice(prefix.length)))
    .map((n) => n.path.slice(prefix.length)));
  const first = new Date(y, m, 1);
  const offset = (first.getDay() + 6) % 7; // semana de lunes a domingo
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(h('span', { class: 'cal-day blank', 'aria-hidden': 'true' }));
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const iso = isoDate(date);
    const cls = ['cal-day'];
    if (iso === isoDate(today)) cls.push('today');
    if (days.has(iso)) cls.push('has-note');
    const cur = S.current && S.vault.index.notes[S.current];
    if (cur && cur.path === `${prefix}${iso}`) cls.push('active');
    cells.push(h('button', {
      class: cls.join(' '),
      type: 'button',
      title: `${formatDate(date, 'dddd D [de] MMMM')}${days.has(iso) ? ' · tiene nota' : ''}`,
      'aria-label': `${formatDate(date, 'dddd D [de] MMMM [de] YYYY')}${days.has(iso) ? ', tiene nota' : ''}`,
      onclick: () => openDaily(date),
    }, String(d)));
  }
  const move = (delta) => {
    S.calMonth = new Date(y, m + delta, 1);
    renderCalendar();
  };
  el.replaceChildren(
    h('div', { class: 'cal-head' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mes anterior', html: icon('chevronLeft'), onclick: () => move(-1) }),
      h('button', { class: 'cal-title', type: 'button', title: 'Ir a hoy', onclick: () => { S.calMonth = null; renderCalendar(); } },
        formatDate(first, 'MMMM YYYY')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mes siguiente', html: icon('chevron'), onclick: () => move(1) })),
    h('div', { class: 'cal-grid', role: 'grid' },
      ...['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => h('span', { class: 'cal-dow', 'aria-hidden': 'true' }, d)),
      ...cells),
  );
}

// --- Nota diaria y plantillas ---
async function templateText(path, fallback) {
  const t = S.vault.findByPath(path);
  if (!t) return fallback;
  try {
    return await S.vault.read(t.id);
  } catch {
    return fallback;
  }
}

async function openDaily(date = new Date()) {
  if (!S.vault) return;
  const path = dailyPath(WS.dailyFolder || '', date);
  const hit = S.vault.findByPath(path);
  if (hit) return openNote(hit.id);
  await saveNow();
  const tpl = await templateText(WS.dailyTemplate || '', DAILY_TEMPLATE);
  const text = applyTemplate(tpl, { title: isoDate(date), date });
  const id = await run(() => S.vault.createNote(path, text));
  if (!id) return undefined;
  expandTo(path);
  return openNote(id);
}

function openHome() {
  const home = WS.home && S.vault.findByPath(WS.home);
  if (home) {
    S.mode = 'read';
    return openNote(home.id);
  }
  notice('Aún no tienes panel principal. Usa «Configurar mi espacio» en el menú ⋯.');
  return undefined;
}

function templateNotes() {
  const f = WS.templatesFolder;
  return S.vault.notes().filter((n) => f && n.path.startsWith(`${f}/`)).sort((a, b) => a.path.localeCompare(b.path, 'es'));
}

function pickModal(title, items) {
  return modal((close) => h('div', { class: 'modal switcher', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('h2', { class: 'pick-title' }, title),
    h('div', { class: 'switcher-list', role: 'listbox' }, ...items.map((it) => h('button', {
      class: 'switcher-item', type: 'button', role: 'option', onclick: () => close(it.value),
    }, h('span', {}, it.label), it.sub ? h('span', { class: 'sub' }, it.sub) : null)))));
}

async function chooseTemplate(title) {
  const list = templateNotes();
  if (!list.length) {
    notice(`No hay plantillas en «${WS.templatesFolder}». Usa «Configurar mi espacio» en el menú ⋯.`);
    return null;
  }
  const prefix = `${WS.templatesFolder}/`;
  return pickModal(title, list.map((n) => ({ label: n.path.slice(prefix.length), value: n })));
}

async function insertTemplate() {
  if (!S.current) return;
  const t = await chooseTemplate('Insertar plantilla');
  if (!t) return;
  const note = S.vault.index.notes[S.current];
  const text = applyTemplate(await S.vault.read(t.id), { title: baseName(note.path), date: new Date() });
  if (S.mode !== 'edit') setMode('edit');
  const ed = $('editor');
  ed.focus();
  const body = ed.value.trim() === '' ? text : `\n${text}`;
  if (!document.execCommand('insertText', false, body)) {
    ed.setRangeText(body, ed.selectionStart, ed.selectionEnd, 'end');
    ed.dispatchEvent(new Event('input'));
  }
}

async function newFromTemplate() {
  const t = await chooseTemplate('Nueva nota desde plantilla');
  if (!t) return;
  const name = await promptModal('Nueva nota', 'Título (puedes poner Carpeta/Título)', '', 'Crear');
  if (!name || !name.trim()) return;
  const path = name.includes('/') ? name : `${currentFolder()}/${name}`;
  const text = applyTemplate(await S.vault.read(t.id), { title: baseName(normalizePath(path)), date: new Date() });
  await saveNow();
  const id = await run(() => S.vault.createNote(path, text));
  if (!id) return;
  expandTo(normalizePath(path));
  await openNote(id);
}

async function setupSpace() {
  const space = starterSpace(WS);
  const missing = space.notes.filter((n) => !S.vault.findByPath(n.path));
  const folders = space.folders.filter((f) => !S.vault.index.folders.includes(f));
  if (!missing.length && !folders.length) {
    notice('Tu espacio ya está configurado.');
    return;
  }
  const ok = await confirmModal('Configurar mi espacio',
    `Se crean el panel «${WS.home}», las carpetas ${space.folders.map((f) => `«${f}»`).join(', ')} y ${missing.length} plantillas y notas. No se toca nada de lo que ya tienes.`,
    'Configurar', false);
  if (!ok) return;
  await saveNow();
  const done = await run(() => S.vault.importNotes(missing, { message: 'configurar mi espacio', folders }));
  if (!done) return;
  for (const f of [WS.templatesFolder, WS.dailyFolder]) if (f) S.expanded.add(f);
  renderTree();
  notice('Espacio listo: panel, diario, proyectos, plantillas y archivo.');
  await openDaily();
}

async function loadExamples() {
  const space = exampleSpace({ dailyFolder: WS.dailyFolder || '' });
  const missing = space.notes.filter((n) => !S.vault.findByPath(n.path));
  if (!missing.length) {
    notice('El proyecto de ejemplo ya está cargado.');
    return;
  }
  const skipped = space.notes.length - missing.length;
  const ok = await confirmModal('Cargar ejemplos',
    `Se crea «${space.root}» con un proyecto, 4 historias, un tablero, una reunión, una píldora y notas diarias de ayer, anteayer y hoy enlazadas entre sí.${skipped ? ` Se respetan ${skipped} notas que ya tienes (por ejemplo, la de hoy).` : ''} Puedes borrarlo cuando quieras.`,
    'Cargar', false);
  if (!ok) return;
  await saveNow();
  const done = await run(() => S.vault.importNotes(missing, { message: 'cargar ejemplos', folders: space.folders }));
  if (!done) return;
  for (const f of space.folders) S.expanded.add(f);
  expandTo(`${space.root}/x`);
  renderTree();
  notice('Ejemplos cargados. Empieza por «Cómo usar este ejemplo».');
  const guide = S.vault.findByPath(`${space.root}/Cómo usar este ejemplo`);
  if (guide) {
    S.mode = 'read';
    await openNote(guide.id);
  }
}

// --- Importar carpeta ---
async function importFolder(files) {
  const plan = planImport(files);
  const skippedTotal = plan.skipped.config + plan.skipped.other + plan.skipped.tooBig;
  if (!plan.notes.length) {
    notice('No hay notas Markdown (.md) en esa carpeta.', 'error');
    return;
  }
  const bytes = plan.notes.reduce((acc, n) => acc + n.file.size, 0);
  const parts = [];
  if (plan.skipped.other) parts.push(`${plan.skipped.other} imágenes u otros ficheros`);
  if (plan.skipped.config) parts.push(`${plan.skipped.config} de configuración (.obsidian, .git…)`);
  if (plan.skipped.tooBig) parts.push(`${plan.skipped.tooBig} notas de más de 2 MB`);
  const folder = await promptModal(
    `Importar ${plan.notes.length} nota${plan.notes.length === 1 ? '' : 's'} (${formatBytes(bytes)})`,
    'Carpeta de destino en Snowlog (vacío = raíz)',
    plan.root,
    'Importar',
    `Se cifran en este dispositivo antes de subir.${skippedTotal ? ` Se omiten ${parts.join(', ')}.` : ''} Si un nombre ya existe, se añade «(importada)».`,
  );
  if (folder == null) return;
  await saveNow();
  const target = normalizePath(folder);
  setStatus('');
  const st = $('st-sync');
  try {
    st.textContent = 'Leyendo ficheros…';
    const items = await Promise.all(plan.notes.map(async (n) => ({
      path: target ? `${target}/${n.path}` : n.path,
      text: await n.file.text(),
    })));
    st.textContent = `Cifrando e importando 0/${items.length}…`;
    const result = await S.vault.importNotes(items, {
      onProgress: (done, total) => {
        S.lastActivity = Date.now();
        st.textContent = `Cifrando e importando ${done}/${total}…`;
      },
    });
    if (target) S.expanded.add(target);
    renderTree();
    st.textContent = '';
    notice(`Importadas ${result.length} notas${target ? ` en «${target}»` : ''}.`);
    if (!S.current && result[0]) openNote(result[0].id);
  } catch (e) {
    renderTree();
    st.textContent = '';
    notice(`La importación se ha detenido: ${errText(e)}. Lo ya importado se conserva.`, 'error');
  }
}

// --- Paneles ---
// --- Tableros Kanban (Markdown con columnas ## y tarjetas - [ ]) ---
// Cada cambio en el tablero reescribe el texto de la nota y se guarda como cualquier edición.
function setBoard(board) {
  const text = K.serializeBoard(board);
  $('editor').value = text;
  scheduleSave();
  clearTimeout(sideTimer);
  sideTimer = setTimeout(refreshSide, 300);
  renderBoard($('reading'), text);
}

function renderBoard(view, text) {
  const board = K.parseBoard(text);
  view.className = 'reading markdown kanban-view';
  const intro = board.pre.join('\n').replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  let drag = null;
  const dropIndex = (cardsEl, y) => {
    const cards = [...cardsEl.querySelectorAll('.kanban-card')];
    const i = cards.findIndex((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
    return i < 0 ? cards.length : i;
  };
  const lanes = board.lanes.map((lane, li) => {
    const cardsEl = h('div', { class: 'kanban-cards', role: 'list' }, ...lane.cards.map((c, ci) => {
      const box = h('input', { type: 'checkbox', class: 'kanban-check', 'aria-label': 'Hecha', checked: c.done });
      box.addEventListener('change', () => setBoard(K.toggleCard(board, li, ci)));
      const textEl = h('div', { class: 'kanban-text', html: inline(c.text) });
      const card = h('div', { class: `kanban-card${c.done ? ' done' : ''}`, role: 'listitem', draggable: 'true' },
        box, textEl,
        h('div', { class: 'kanban-card-actions' },
          li > 0 ? h('button', { class: 'icon-btn', type: 'button', title: 'A la columna anterior', 'aria-label': 'A la columna anterior', onclick: () => setBoard(K.moveCard(board, { lane: li, index: ci }, { lane: li - 1, index: 1e9 })) }, '‹') : null,
          li < board.lanes.length - 1 ? h('button', { class: 'icon-btn', type: 'button', title: 'A la columna siguiente', 'aria-label': 'A la columna siguiente', onclick: () => setBoard(K.moveCard(board, { lane: li, index: ci }, { lane: li + 1, index: 1e9 })) }, '›') : null,
          h('button', { class: 'icon-btn', type: 'button', title: 'Editar', 'aria-label': 'Editar tarjeta', onclick: async () => {
            const t = await promptModal('Editar tarjeta', 'Texto', c.text, 'Guardar');
            if (t != null && t.trim()) setBoard(K.editCard(board, li, ci, t));
          } }, '✎'),
          h('button', { class: 'icon-btn', type: 'button', title: 'Eliminar', 'aria-label': 'Eliminar tarjeta', onclick: () => setBoard(K.deleteCard(board, li, ci)) }, '×')));
      card.addEventListener('dragstart', (ev) => {
        drag = { lane: li, index: ci };
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', c.text);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      return card;
    }));
    cardsEl.addEventListener('dragover', (ev) => { if (drag) { ev.preventDefault(); cardsEl.classList.add('drop'); } });
    cardsEl.addEventListener('dragleave', () => cardsEl.classList.remove('drop'));
    cardsEl.addEventListener('drop', (ev) => {
      if (!drag) return;
      ev.preventDefault();
      const to = { lane: li, index: dropIndex(cardsEl, ev.clientY) };
      const from = drag;
      drag = null;
      setBoard(K.moveCard(board, from, to));
    });
    const add = h('input', { class: 'input kanban-add', placeholder: '+ Añadir tarjeta', 'aria-label': `Añadir tarjeta a ${lane.title}` });
    add.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && add.value.trim()) {
        ev.preventDefault();
        setBoard(K.addCard(board, li, add.value));
        $('reading').querySelectorAll('.kanban-add')[li]?.focus();
      }
    });
    const done = lane.cards.filter((c) => c.done).length;
    return h('section', { class: 'kanban-lane', 'aria-label': lane.title },
      h('header', { class: 'kanban-lane-head' },
        h('span', { class: 'kanban-lane-title', html: inline(lane.title) }),
        h('span', { class: 'kanban-count' }, done ? `${done}/${lane.cards.length}` : String(lane.cards.length)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Opciones de ${lane.title}`, html: icon('more'), onclick: (ev) => {
          const r = ev.currentTarget.getBoundingClientRect();
          openMenu(r.left, r.bottom, [
            ['rename', 'Renombrar columna', async () => {
              const t = await promptModal('Renombrar columna', 'Nombre', lane.title, 'Renombrar');
              if (t != null && t.trim()) setBoard(K.renameLane(board, li, t));
            }],
            li > 0 && ['chevronLeft', 'Mover a la izquierda', () => setBoard(K.moveLane(board, li, li - 1))],
            li < board.lanes.length - 1 && ['chevron', 'Mover a la derecha', () => setBoard(K.moveLane(board, li, li + 1))],
            null,
            ['trash', 'Eliminar columna', async () => {
              if (lane.cards.length && !(await confirmModal('Eliminar columna', `Se borrarán también sus ${lane.cards.length} tarjetas.`, 'Eliminar'))) return;
              setBoard(K.deleteLane(board, li));
            }, 'danger'],
          ].filter((x) => x !== false));
        } })),
      cardsEl, add);
  });
  const newLane = h('button', { class: 'kanban-new-lane', type: 'button', onclick: async () => {
    const t = await promptModal('Nueva columna', 'Nombre', '', 'Crear');
    if (t != null && t.trim()) setBoard(K.addLane(board, t));
  } }, '+ Columna');
  const parts = [];
  if (intro) {
    const introEl = h('div', { class: 'kanban-intro' });
    introEl.innerHTML = trusted(render(intro));
    parts.push(introEl);
  }
  parts.push(h('div', { class: 'kanban' }, ...lanes, newLane));
  view.replaceChildren(...parts);
}

async function newBoard() {
  await saveNow();
  const path = S.vault.freePath(currentFolder(), 'Tablero');
  const id = await run(() => S.vault.createNote(path, K.NEW_BOARD));
  if (!id) return;
  expandTo(path);
  S.mode = 'read';
  await openNote(id);
}

// --- Vista de grafo ---
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

async function graphView(focusId = null) {
  if (!S.vault) return;
  await saveNow();
  modal((close) => {
    const canvas = h('canvas', { class: 'graph-canvas', 'aria-label': 'Grafo de notas' });
    const info = h('span', { class: 'graph-info' }, 'Preparando…');
    const localBox = h('input', { type: 'checkbox', id: 'graph-local', checked: !!focusId });
    const depthSel = h('select', { class: 'input graph-depth', 'aria-label': 'Saltos' }, ...[1, 2, 3].map((d) => h('option', { value: String(d) }, `${d} salto${d > 1 ? 's' : ''}`)));
    const orphans = h('input', { type: 'checkbox', id: 'graph-orphans', checked: true });
    const box = h('div', { class: 'modal graph', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Vista de grafo' },
      h('div', { class: 'graph-bar' },
        h('h2', {}, 'Grafo'),
        S.current ? h('label', { class: 'check', for: 'graph-local' }, localBox, 'Solo esta nota') : null,
        S.current ? depthSel : null,
        h('label', { class: 'check', for: 'graph-orphans' }, orphans, 'Notas sin enlaces'),
        info,
        h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cerrar')),
      canvas);
    let g = { nodes: [], links: [] };
    let full = null;
    let raf = 0;
    let alive = true;
    let energy = Infinity;
    let view = { x: 0, y: 0, k: 1 };
    let hover = -1;
    let dragNode = -1;
    let pan = null;
    let moved = false;
    const ctx = canvas.getContext('2d');
    const size = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return r;
    };
    const toWorld = (px, py) => {
      const r = canvas.getBoundingClientRect();
      return { x: (px - r.left - r.width / 2 - view.x) / view.k, y: (py - r.top - r.height / 2 - view.y) / view.k };
    };
    const nodeAt = (px, py) => {
      const p = toWorld(px, py);
      let best = -1;
      let bd = Infinity;
      g.nodes.forEach((n, i) => {
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        const rad = 4 + Math.sqrt(n.deg) * 2 + 4 / view.k;
        if (d < rad && d < bd) { best = i; bd = d; }
      });
      return best;
    };
    const neighbors = (i) => {
      const set = new Set([i]);
      for (const l of g.links) {
        if (l.s === i) set.add(l.t);
        if (l.t === i) set.add(l.s);
      }
      return set;
    };
    const draw = () => {
      const r = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, r.width, r.height);
      ctx.save();
      ctx.translate(r.width / 2 + view.x, r.height / 2 + view.y);
      ctx.scale(view.k, view.k);
      const lit = hover >= 0 ? neighbors(hover) : null;
      const accent = cssVar('--accent');
      const faint = cssVar('--text-faint');
      const text = cssVar('--text-normal');
      ctx.lineWidth = 1.2 / view.k;
      for (const l of g.links) {
        const a = g.nodes[l.s];
        const b = g.nodes[l.t];
        ctx.strokeStyle = lit && (l.s === hover || l.t === hover) ? accent : faint;
        ctx.globalAlpha = lit && !(l.s === hover || l.t === hover) ? 0.15 : 0.45;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.font = `${12 / view.k}px ${cssVar('--font-ui')}`;
      ctx.textAlign = 'center';
      g.nodes.forEach((n, i) => {
        const rad = 4 + Math.sqrt(n.deg) * 2;
        const isCur = n.id === S.current;
        ctx.globalAlpha = lit && !lit.has(i) ? 0.3 : 1;
        ctx.fillStyle = isCur || i === hover ? accent : faint;
        ctx.beginPath();
        ctx.arc(n.x, n.y, rad, 0, Math.PI * 2);
        ctx.fill();
        if (view.k > 0.7 || i === hover || isCur || (lit && lit.has(i)) || n.deg > 5) {
          ctx.fillStyle = text;
          ctx.fillText(n.name, n.x, n.y + rad + 13 / view.k);
        }
      });
      ctx.restore();
    };
    let fitted = false;
    let touched = false;
    // Encaja el grafo en la pantalla cuando se ha quedado quieto (si no lo ha movido la persona).
    const fit = () => {
      if (!g.nodes.length) return;
      const r = canvas.getBoundingClientRect();
      const xs = g.nodes.map((n) => n.x);
      const ys = g.nodes.map((n) => n.y);
      const w = Math.max(...xs) - Math.min(...xs) + 120;
      const hh = Math.max(...ys) - Math.min(...ys) + 120;
      view.k = Math.max(0.1, Math.min(2, Math.min(r.width / w, r.height / hh)));
      view.x = -((Math.max(...xs) + Math.min(...xs)) / 2) * view.k;
      view.y = -((Math.max(...ys) + Math.min(...ys)) / 2) * view.k;
    };
    const loop = () => {
      if (!alive) return;
      if (energy > 0.02 || dragNode >= 0) energy = graphStep(g, { fixed: dragNode });
      if (!touched && (!fitted || energy > 0.02)) {
        fit();
        fitted = energy <= 0.02;
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    const rebuild = () => {
      let next = full;
      if (S.current && localBox.checked) next = localGraph(full, S.current, Number(depthSel.value));
      if (!orphans.checked) {
        const keep = next.nodes.map((n, i) => (n.deg > 0 || n.id === S.current ? i : -1)).filter((i) => i >= 0);
        const map = new Map(keep.map((o, i) => [o, i]));
        next = { nodes: keep.map((i) => next.nodes[i]), links: next.links.filter((l) => map.has(l.s) && map.has(l.t)).map((l) => ({ s: map.get(l.s), t: map.get(l.t) })) };
      }
      g = initLayout(structuredClone(next));
      energy = Infinity;
      fitted = false;
      touched = false;
      view = { x: 0, y: 0, k: g.nodes.length > 200 ? 0.5 : 1 };
      info.textContent = `${g.nodes.length} nota${g.nodes.length === 1 ? '' : 's'} · ${g.links.length} enlace${g.links.length === 1 ? '' : 's'}`;
    };
    for (const el of [localBox, depthSel, orphans]) el.addEventListener('change', rebuild);
    canvas.addEventListener('pointerdown', (ev) => {
      canvas.setPointerCapture(ev.pointerId);
      touched = true;
      moved = false;
      dragNode = nodeAt(ev.clientX, ev.clientY);
      pan = dragNode < 0 ? { x: ev.clientX - view.x, y: ev.clientY - view.y } : null;
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (dragNode >= 0) {
        const p = toWorld(ev.clientX, ev.clientY);
        Object.assign(g.nodes[dragNode], { x: p.x, y: p.y });
        moved = true;
        energy = Infinity;
      } else if (pan) {
        view.x = ev.clientX - pan.x;
        view.y = ev.clientY - pan.y;
        moved = true;
      } else {
        hover = nodeAt(ev.clientX, ev.clientY);
        canvas.style.cursor = hover >= 0 ? 'pointer' : 'grab';
      }
    });
    canvas.addEventListener('pointerup', (ev) => {
      const hit = nodeAt(ev.clientX, ev.clientY);
      const wasDrag = moved;
      dragNode = -1;
      pan = null;
      if (!wasDrag && hit >= 0) {
        const id = g.nodes[hit].id;
        close(null);
        openNote(id);
      }
    });
    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      touched = true;
      const r = canvas.getBoundingClientRect();
      const k = Math.max(0.1, Math.min(4, view.k * Math.exp(-ev.deltaY * 0.0015)));
      const cx = ev.clientX - r.left - r.width / 2;
      const cy = ev.clientY - r.top - r.height / 2;
      view.x = cx - ((cx - view.x) * k) / view.k;
      view.y = cy - ((cy - view.y) * k) / view.k;
      view.k = k;
    }, { passive: false });
    const ro = new ResizeObserver(() => size());
    ro.observe(canvas);
    // Se para todo al cerrar el diálogo (o al bloquear, que vacía los diálogos).
    const stop = new MutationObserver(() => {
      if (!box.isConnected) {
        alive = false;
        cancelAnimationFrame(raf);
        ro.disconnect();
        stop.disconnect();
      }
    });
    stop.observe($('modal-root'), { childList: true });
    (async () => {
      await ensureIndex().catch(() => {});
      syncIndex();
      if (!alive) return;
      full = buildGraph(indexedNotes());
      rebuild();
      size();
      loop();
    })();
    return box;
  });
}

// --- Marcadores (rutas de notas, en los ajustes de la bóveda: se comparten entre dispositivos) ---
const bookmarks = () => (Array.isArray(WS.bookmarks) ? WS.bookmarks : []);
const isBookmarked = (id) => !!S.vault?.index.notes[id] && bookmarks().includes(S.vault.index.notes[id].path);

async function setBookmarks(list) {
  try {
    await S.vault.saveSettings({ ...S.vault.getSettings(), bookmarks: list });
  } catch (e) {
    notice(`No se pudieron guardar los marcadores: ${errText(e)}`, 'error');
    return false;
  }
  applySettings();
  renderBookmarks();
  return true;
}

async function toggleBookmark(id) {
  const path = S.vault?.index.notes[id]?.path;
  if (!path) return;
  const list = bookmarks();
  const on = !list.includes(path);
  if (await setBookmarks(on ? [...list, path] : list.filter((p) => p !== path))) {
    notice(on ? `«${baseName(path)}» añadida a marcadores.` : `«${baseName(path)}» quitada de marcadores.`);
  }
}

// Al renombrar o mover, los marcadores siguen a sus notas.
async function moveBookmarks(moves) {
  const list = bookmarks();
  const next = list.map((p) => moves.find((m) => m.from === p)?.to || p);
  if (next.some((p, i) => p !== list[i])) await setBookmarks(next);
}

function renderBookmarks() {
  const box = $('bookmark-list');
  if (!box || !S.vault) return;
  const items = bookmarks().map((p) => ({ path: p, note: S.vault.findByPath(p) }));
  box.replaceChildren(...(items.length
    ? items.map(({ path, note }) => h('div', { class: 'bookmark-row', role: 'listitem' },
      h('button', { class: `bookmark-open${note ? '' : ' missing'}`, type: 'button', title: path, disabled: !note, onclick: () => { closeMobilePanels(); openNote(note.id); } },
        h('span', { class: 'search-name' }, baseName(path)), parentPath(path) ? h('span', { class: 'search-folder' }, parentPath(path)) : null),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Quitar «${baseName(path)}» de marcadores`, title: 'Quitar', onclick: () => setBookmarks(bookmarks().filter((x) => x !== path)) }, '×')))
    : [h('p', { class: 'search-empty' }, 'Sin marcadores. Usa «Añadir a marcadores» en el menú ⋯ de una nota.')]));
}

// --- Paleta de comandos (Ctrl+P) ---
function commands() {
  const cur = S.current && S.vault?.index.notes[S.current] ? S.current : null;
  const list = [
    ['open', 'Abrir nota', 'Ctrl+O', () => quickSwitcher()],
    ['search', 'Buscar en todas las notas', 'Ctrl+Mayús+F', () => openSearch()],
    ['new', 'Nueva nota', 'Ctrl+N', () => newNote()],
    ['new-tpl', 'Nueva nota desde plantilla', '', () => newFromTemplate()],
    ['today', 'Nota de hoy', 'Ctrl+D', () => openDaily()],
    ['home', 'Panel principal', '', () => openHome()],
    ['mode', 'Cambiar entre edición y lectura', 'Ctrl+E', () => ACTIONS['toggle-mode']()],
    ['save', 'Guardar ahora', 'Ctrl+S', () => saveNow()],
    cur && ['tpl', 'Insertar plantilla', '', () => insertTemplate()],
    cur && ['attach', 'Adjuntar imagen o PDF', '', () => $('attach-input').click()],
    cur && ['bookmark', isBookmarked(cur) ? 'Quitar de marcadores' : 'Añadir a marcadores', '', () => toggleBookmark(cur)],
    cur && ['rename', 'Renombrar nota', '', () => renameNotePrompt(cur)],
    cur && ['move', 'Mover nota', '', () => moveNotePrompt(cur)],
    cur && ['history', 'Historial de versiones', '', () => historyModal(cur)],
    cur && ['delete', 'Eliminar nota', '', () => deleteNote(cur)],
    ['graph', 'Vista de grafo', 'Ctrl+G', () => graphView()],
    cur && ['graph-local', 'Grafo de esta nota', '', () => graphView(cur)],
    ['board', 'Nuevo tablero Kanban', '', () => newBoard()],
    ['files', 'Ver archivos', '', () => showLeftPane('files')],
    ['tags', 'Ver etiquetas', '', () => showLeftPane('tags')],
    ['bookmarks', 'Ver marcadores', '', () => showLeftPane('bookmarks')],
    ['left', 'Mostrar u ocultar el panel izquierdo', '', () => togglePanel('left')],
    ['right', 'Mostrar u ocultar el panel derecho', '', () => togglePanel('right')],
    ['collapse', 'Plegar todas las carpetas', '', () => ACTIONS['collapse-all']()],
    ['settings', 'Ajustes', '', () => settingsModal()],
    ['theme-light', 'Tema claro', '', () => { try { localStorage.setItem('snowlog.theme', 'light'); } catch { /* */ } applyTheme('light'); }],
    ['theme-dark', 'Tema oscuro', '', () => { try { localStorage.setItem('snowlog.theme', 'dark'); } catch { /* */ } applyTheme('dark'); }],
    ['theme-auto', 'Tema automático', '', () => { try { localStorage.setItem('snowlog.theme', 'auto'); } catch { /* */ } applyTheme('auto'); }],
    ['setup', 'Configurar mi espacio', '', () => setupSpace()],
    ['examples', 'Cargar ejemplos', '', () => loadExamples()],
    ['import', 'Importar carpeta de Markdown', '', () => ACTIONS.import()],
    ['backup', S.local ? 'Copia de seguridad (.zip)' : 'Copia de seguridad cifrada', '', () => backupNow()],
    ['restore', 'Importar copia (.snowlog o .zip)', '', () => $('backup-input').click()],
    !S.local && ['export', 'Exportar sin cifrar (.zip)', '', () => exportZip()],
    !S.local && ['security', 'Frase de paso y recuperación', '', () => securityModal()],
    ['lock', S.local ? 'Cerrar carpeta' : 'Bloquear', '', () => lock()],
  ];
  return list.filter(Boolean).map(([id, label, keys, run]) => ({ id, label, keys, run }));
}

function recentCommands() {
  try { return JSON.parse(localStorage.getItem('snowlog.recentCommands') || '[]'); } catch { return []; }
}

function commandPalette() {
  if (!S.vault) return;
  const all = commands();
  const recent = recentCommands();
  modal((close) => {
    const input = h('input', { class: 'input', placeholder: 'Escribe un comando…', 'aria-label': 'Buscar comando', autocomplete: 'off', spellcheck: 'false' });
    const list = h('div', { class: 'switcher-list', role: 'listbox' });
    let items = [];
    let sel = 0;
    const draw = () => {
      const words = fold(input.value.trim()).split(/\s+/).filter(Boolean);
      items = all.filter((c) => words.every((w) => fold(c.label).includes(w)));
      if (!words.length) items.sort((a, b) => (recent.indexOf(a.id) + 1 || 99) - (recent.indexOf(b.id) + 1 || 99));
      sel = Math.min(sel, Math.max(0, items.length - 1));
      list.replaceChildren(...(items.length ? items.map((c, i) => h('button', {
        class: `switcher-item command-item${i === sel ? ' sel' : ''}`, type: 'button', role: 'option', 'aria-selected': String(i === sel), onclick: () => pick(i),
      }, h('span', {}, c.label), c.keys ? h('kbd', {}, c.keys) : null)) : [h('p', { class: 'search-empty' }, 'Ningún comando coincide.')]));
      list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    };
    const pick = (i) => {
      const c = items[i];
      if (!c) return;
      try { localStorage.setItem('snowlog.recentCommands', JSON.stringify([c.id, ...recent.filter((x) => x !== c.id)].slice(0, 8))); } catch { /* */ }
      close(null);
      setTimeout(() => c.run(), 0);
    };
    input.addEventListener('input', () => { sel = 0; draw(); });
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); sel = Math.min(sel + 1, items.length - 1); draw(); }
      if (ev.key === 'ArrowUp') { ev.preventDefault(); sel = Math.max(sel - 1, 0); draw(); }
      if (ev.key === 'Enter') { ev.preventDefault(); pick(sel); }
    });
    draw();
    return h('div', { class: 'modal switcher', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paleta de comandos' },
      input, list, h('div', { class: 'switcher-hint' }, '↑↓ para moverte · Intro para ejecutar · Esc para cerrar'));
  });
}

// --- Vista previa al pasar sobre un [[enlace]] ---
let previewTimer = null;
function hidePreview() {
  clearTimeout(previewTimer);
  $('hover-preview').hidden = true;
  $('hover-preview').replaceChildren();
}

function setupHoverPreview() {
  const box = $('hover-preview');
  if (!matchMedia('(hover: hover)').matches) return; // en pantallas táctiles, no
  document.addEventListener('mouseover', (ev) => {
    const link = ev.target.closest?.('a.internal-link');
    if (!link || !S.vault || link.closest('#hover-preview')) return;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      const note = S.vault?.findByTitle(link.dataset.target || '');
      if (!note || !link.isConnected) return;
      let text;
      try { text = await S.vault.read(note.id); } catch { return; }
      if (!link.matches(':hover')) return;
      const body = h('div', { class: 'markdown' });
      body.innerHTML = trusted(render(text.length > 4000 ? `${text.slice(0, 4000)}\n\n…` : text, { frontmatter: true }));
      box.replaceChildren(h('div', { class: 'hover-title' }, baseName(note.path)), body);
      const r = link.getBoundingClientRect();
      box.hidden = false;
      const w = box.offsetWidth;
      const hgt = box.offsetHeight;
      box.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
      box.style.top = `${r.bottom + 6 + hgt > innerHeight ? Math.max(8, r.top - hgt - 6) : r.bottom + 6}px`;
    }, 450);
  });
  document.addEventListener('mouseout', (ev) => {
    const link = ev.target.closest?.('a.internal-link');
    if (!link) return;
    if (ev.relatedTarget && box.contains(ev.relatedTarget)) return;
    clearTimeout(previewTimer);
    setTimeout(() => { if (!box.matches(':hover')) hidePreview(); }, 150);
  });
  box.addEventListener('mouseleave', hidePreview);
  addEventListener('scroll', hidePreview, true);
}

// --- Ajustes ---
async function settingsModal() {
  if (!S.vault) return;
  const cur = { ...WS };
  const folders = [...S.vault.index.folders].sort((a, b) => collator.compare(a, b));
  const notes = S.vault.notes().map((n) => n.path).sort((a, b) => collator.compare(a, b));
  const dl = (id, items) => h('datalist', { id }, ...items.map((v) => h('option', { value: v })));
  const text = (id, label, value, list, hint) => {
    const input = h('input', { class: 'input', id, value: value ?? '', list, autocomplete: 'off', spellcheck: 'false' });
    return [h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('small', { class: 'field-hint' }, hint) : null), input];
  };
  const num = (id, label, value, min, max, hint) => {
    const input = h('input', { class: 'input', id, type: 'number', min: String(min), max: String(max), value: String(value ?? '') });
    return [h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('small', { class: 'field-hint' }, hint) : null), input];
  };
  let theme = 'auto';
  try { theme = localStorage.getItem('snowlog.theme') || 'auto'; } catch { /* sin almacenamiento */ }
  const result = await modal((close) => {
    const [fHome, iHome] = text('st-home', 'Panel principal (nota)', cur.home, 'dl-notes');
    const [fDaily, iDaily] = text('st-daily', 'Carpeta del diario', cur.dailyFolder, 'dl-folders', 'Las notas diarias se llaman AAAA-MM-DD.');
    const [fTpl, iTpl] = text('st-tpl', 'Plantilla de la nota diaria', cur.dailyTemplate, 'dl-notes');
    const [fTpls, iTpls] = text('st-tpls', 'Carpeta de plantillas', cur.templatesFolder, 'dl-folders', 'Lo que hay aquí no sale en las consultas.');
    const [fAtt, iAtt] = text('st-att', 'Carpeta de adjuntos', cur.attachmentsFolder, 'dl-folders');
    const openDaily = h('input', { type: 'checkbox', id: 'st-open', checked: !!cur.openDailyOnStart });
    const [fLock, iLock] = num('st-lock', 'Bloquear tras estos minutos sin usarlo', cur.lockAfterMinutes, 1, 240);
    const [fBk, iBk] = num('st-bk', 'Recordar la copia de seguridad cada (días)', cur.backupReminderDays, 0, 365, '0 = no recordar.');
    const themeSel = h('select', { class: 'input', id: 'st-theme' },
      ...[['auto', 'Automático (el del sistema)'], ['light', 'Claro'], ['dark', 'Oscuro']]
        .map(([v, l]) => h('option', { value: v, selected: v === theme }, l)));
    themeSel.addEventListener('change', () => applyTheme(themeSel.value));
    const err = errorLine();
    const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Guardar');
    const form = h('form', { class: 'modal settings', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Ajustes' },
      h('h2', {}, 'Ajustes'),
      dl('dl-folders', folders), dl('dl-notes', notes),
      h('h3', {}, 'Día a día'), fHome, fDaily, fTpl,
      h('label', { class: 'check', for: 'st-open' }, openDaily, 'Abrir la nota de hoy al entrar'),
      h('h3', {}, 'Carpetas'), fTpls, fAtt,
      h('h3', {}, 'Seguridad y copias'), S.local ? null : fLock, fBk,
      h('h3', {}, 'Este dispositivo'), h('div', { class: 'field' }, h('label', { for: 'st-theme' }, 'Tema'), themeSel),
      h('p', { class: 'field-hint' }, S.local ? 'Los ajustes se guardan en la carpeta (.snowlog/ajustes.json).' : 'Los ajustes se guardan cifrados en tu bóveda y valen en todos tus dispositivos. El tema es solo de este dispositivo.'),
      err,
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => { applyTheme(theme); close(null); } }, 'Cancelar'),
        btn));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const clean = (v) => normalizePath(v || '');
      const lockMin = Math.round(Number(iLock.value));
      const bkDays = Math.round(Number(iBk.value));
      if (!S.local && !(lockMin >= 1 && lockMin <= 240)) return showError(err, 'El bloqueo tiene que estar entre 1 y 240 minutos.');
      if (!(bkDays >= 0 && bkDays <= 365)) return showError(err, 'El recordatorio tiene que estar entre 0 y 365 días.');
      close({
        theme: themeSel.value,
        settings: {
          home: clean(iHome.value),
          dailyFolder: clean(iDaily.value),
          dailyTemplate: clean(iTpl.value),
          templatesFolder: clean(iTpls.value),
          attachmentsFolder: clean(iAtt.value),
          openDailyOnStart: openDaily.checked,
          ...(S.local ? {} : { lockAfterMinutes: lockMin }),
          backupReminderDays: bkDays,
        },
      });
    });
    return form;
  });
  if (!result) return;
  try { localStorage.setItem('snowlog.theme', result.theme); } catch { /* sin almacenamiento */ }
  applyTheme(result.theme);
  // Solo se guarda lo que difiere de los valores por defecto.
  const changed = Object.fromEntries(Object.entries(result.settings).filter(([k, v]) => v !== DEFAULTS[k]));
  const before = JSON.stringify(S.vault.getSettings());
  if (JSON.stringify(changed) !== before) {
    try {
      await S.vault.saveSettings(changed);
    } catch (e) {
      notice(`No se pudieron guardar los ajustes: ${errText(e)}`, 'error');
      return;
    }
  }
  applySettings();
  renderCalendar();
  notice('Ajustes guardados.');
}

// --- Frase de paso y código de recuperación ---
async function securityModal() {
  if (S.local || !S.vaultFile) return;
  const choice = await modal((close) => h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Frase de paso y recuperación' },
    h('h2', {}, 'Frase de paso y recuperación'),
    h('p', {}, 'La clave que cifra tus notas no cambia: solo cambia cómo se abre. No hace falta recifrar nada.'),
    h('div', { class: 'security-options' },
      h('button', { class: 'btn', type: 'button', onclick: () => close('pass') }, 'Cambiar la frase de paso'),
      h('button', { class: 'btn', type: 'button', onclick: () => close('recovery') }, 'Generar un código de recuperación nuevo')),
    h('div', { class: 'modal-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cerrar'))));
  if (choice === 'pass') changePassphraseModal();
  else if (choice === 'recovery') renewRecoveryModal();
}

function secretForm(title, text, fields, okText, onSubmit) {
  return modal((close) => {
    const err = errorLine();
    const btn = h('button', { class: 'btn primary', type: 'submit' }, okText);
    const form = h('form', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('h2', {}, title), h('p', {}, text), ...fields.map((f) => f[0]), err,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cancelar'), btn));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const done = busy(btn, 'Cifrando…');
      try {
        const result = await onSubmit(fields.map((f) => f[1].value));
        for (const f of fields) f[1].value = '';
        close(result);
      } catch (e) {
        done();
        showError(err, e);
      }
    });
    return form;
  });
}

async function changePassphraseModal() {
  const ok = await secretForm('Cambiar la frase de paso',
    'En los demás dispositivos se pedirá la frase nueva la próxima vez que se desbloqueen.',
    [passField('sp0', 'Frase de paso actual'), passField('sp1', 'Nueva frase de paso (mínimo 12 caracteres)', 'new-password'), passField('sp2', 'Repite la nueva frase', 'new-password')],
    'Cambiar la frase',
    async ([old, p1, p2]) => {
      if (p1.length < 12) throw new Error('Usa al menos 12 caracteres.');
      if (p1 !== p2) throw new Error('Las dos frases no coinciden.');
      if (p1 === old) throw new Error('La frase nueva es igual que la actual.');
      const current = (await Vault.fetchVaultFile(S.repo)) || S.vaultFile;
      const updated = await C.changePassphrase(current, old, p1, CONFIG.kdfIterations);
      await S.vault.writeVaultFile(updated, 'cambiar frase de paso');
      S.vaultFile = updated;
      Auth.cacheVault(updated);
      return true;
    });
  if (ok) notice('Frase de paso cambiada.');
}

async function renewRecoveryModal() {
  const code = await secretForm('Código de recuperación nuevo',
    'El código anterior dejará de servir. Después tendrás que apuntar el nuevo.',
    [passField('sr0', 'Frase de paso actual')],
    'Generar código',
    async ([pass]) => {
      const current = (await Vault.fetchVaultFile(S.repo)) || S.vaultFile;
      const { vault: updated, recoveryCode } = await C.renewRecoveryCode(current, pass, CONFIG.kdfIterations);
      await S.vault.writeVaultFile(updated, 'nuevo código de recuperación');
      S.vaultFile = updated;
      Auth.cacheVault(updated);
      return recoveryCode;
    });
  if (!code) return;
  await modal((close) => {
    const check = h('input', { type: 'checkbox', id: 'saved2' });
    const btn = h('button', { class: 'btn primary', type: 'button', disabled: true, onclick: () => close(true) }, 'Hecho');
    check.addEventListener('change', () => { btn.disabled = !check.checked; });
    return h('div', { class: 'modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'Tu código de recuperación nuevo' },
      h('h2', {}, 'Tu código de recuperación nuevo'),
      h('p', {}, 'Apúntalo en papel y guárdalo en un sitio seguro. No se volverá a mostrar.'),
      h('div', { class: 'recovery-code' }, code),
      h('label', { class: 'check', for: 'saved2' }, check, 'Lo he guardado en un sitio seguro'),
      h('div', { class: 'modal-actions' }, btn));
  });
}

// --- Historial de versiones ---
const dateFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function whenText(iso) {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  if (ms < 60000) return 'hace un momento';
  if (ms < 3600000) return `hace ${Math.round(ms / 60000)} min`;
  if (ms < 86400000) return `hace ${Math.round(ms / 3600000)} h`;
  return dateFmt.format(new Date(iso));
}

// Resumen de cambios entre dos textos por líneas: { added, removed }.
function lineDiff(a, b) {
  const count = (t) => t.split('\n').reduce((m, l) => m.set(l, (m.get(l) || 0) + 1), new Map());
  const ca = count(a);
  const cb = count(b);
  let added = 0;
  let removed = 0;
  for (const [l, n] of cb) added += Math.max(0, n - (ca.get(l) || 0));
  for (const [l, n] of ca) removed += Math.max(0, n - (cb.get(l) || 0));
  return { added, removed };
}

async function historyModal(id) {
  if (!S.vault?.history) return;
  await saveNow();
  const vault = S.vault;
  const note = vault.index.notes[id];
  if (!note) return;
  let versions = [];
  let sel = 0;
  const texts = new Map();
  const current = await vault.read(id);
  const restored = await modal((close) => {
    const list = h('div', { class: 'history-list', role: 'listbox', 'aria-label': 'Versiones' }, h('p', { class: 'search-empty' }, 'Cargando versiones…'));
    const preview = h('article', { class: 'history-preview markdown' });
    const info = h('p', { class: 'history-info' });
    const restore = h('button', { class: 'btn primary', type: 'button', disabled: true }, 'Restaurar esta versión');
    const show = async (i) => {
      sel = i;
      [...list.children].forEach((b, j) => { b.classList.toggle('sel', j === i); b.setAttribute('aria-selected', String(j === i)); });
      const v = versions[i];
      restore.disabled = true;
      preview.replaceChildren(h('p', { class: 'search-empty' }, 'Descifrando…'));
      try {
        if (!texts.has(v.ref)) texts.set(v.ref, await vault.readVersion(id, v.ref));
        if (sel !== i) return;
        const text = texts.get(v.ref);
        preview.innerHTML = trusted(render(text, { frontmatter: true }));
        const d = lineDiff(current, text);
        info.textContent = i === 0 || text === current
          ? 'Es la versión actual.'
          : `Esta versión tiene ${d.added} línea${d.added === 1 ? '' : 's'} que la actual no tiene y le falta${d.removed === 1 ? '' : 'n'} ${d.removed}.`;
        restore.disabled = i === 0 || text === current;
      } catch (e) {
        preview.replaceChildren(h('p', { class: 'embed-missing' }, `No se pudo abrir esta versión: ${errText(e)}`));
      }
    };
    restore.addEventListener('click', () => close(texts.get(versions[sel].ref)));
    const box = h('div', { class: 'modal history', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Historial de versiones' },
      h('h2', {}, `Historial de «${baseName(note.path)}»`),
      h('div', { class: 'history-body' }, list, h('div', { class: 'history-right' }, info, preview)),
      h('div', { class: 'modal-actions' },
        h('span', { class: 'history-hint' }, S.local ? 'Se guarda una copia como mucho cada 10 minutos.' : 'Cada versión sigue cifrada en el repo.'),
        h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, 'Cerrar'),
        restore));
    vault.history(id).then((vs) => {
      versions = vs;
      list.replaceChildren(...vs.map((v, i) => h('button', {
        class: 'switcher-item', type: 'button', role: 'option', onclick: () => show(i),
      }, h('span', {}, i === 0 ? 'Actual' : whenText(v.date)), h('span', { class: 'sub' }, dateFmt.format(new Date(v.date))))));
      if (vs.length) show(0);
      else list.replaceChildren(h('p', { class: 'search-empty' }, 'Sin versiones anteriores.'));
    }).catch((e) => list.replaceChildren(h('p', { class: 'embed-missing' }, errText(e))));
    return box;
  });
  if (restored == null || S.vault !== vault) return;
  if (S.current === id) {
    $('editor').value = restored;
    autosize();
    if (S.mode === 'read') setMode('read');
    S.dirty = true;
    await saveNow();
  } else {
    await run(() => vault.saveNote(id, restored));
  }
  syncIndex();
  refreshSide();
  notice('Versión restaurada. La que había sigue en el historial.');
}

// --- Adjuntos (imágenes y PDF) ---
const fmtSize = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
let blobUrls = [];

function blobUrl(bytes, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  blobUrls.push(url);
  return url;
}

function revokeBlobs() {
  for (const u of blobUrls) URL.revokeObjectURL(u);
  blobUrls = [];
}

// Rellena los huecos ![[adjunto]] del modo lectura con la imagen o el PDF descifrados.
async function fillEmbeds(view) {
  const vault = S.vault;
  for (const slot of view.querySelectorAll('span.embed')) {
    const name = slot.dataset.embed;
    const f = vault.findFile(name);
    if (!f) {
      slot.className = 'embed embed-missing';
      slot.textContent = `No encuentro el adjunto «${name}»`;
      continue;
    }
    slot.className = 'embed embed-loading';
    try {
      const bytes = await vault.readFile(f.id);
      if (S.vault !== vault || !slot.isConnected) return;
      if (f.type === 'application/pdf') {
        slot.replaceWith(h('span', { class: 'embed-file' },
          h('span', { class: 'embed-file-ext' }, 'PDF'),
          h('span', { class: 'embed-file-name' }, baseName(f.path), h('small', {}, fmtSize(f.size))),
          h('a', { class: 'embed-open', href: blobUrl(bytes, f.type), target: '_blank', rel: 'noopener' }, 'Abrir')));
      } else {
        const img = h('img', { class: 'embed-img', alt: baseName(f.path), src: `data:${f.type};base64,${C.toB64(bytes)}` });
        if (slot.dataset.width) img.style.width = `${slot.dataset.width}px`;
        img.addEventListener('click', () => openAttachment(f.id));
        slot.replaceWith(img);
      }
    } catch (e) {
      slot.className = 'embed embed-missing';
      slot.textContent = `No se pudo abrir «${name}»: ${errText(e)}`;
    }
  }
}

// Abre el adjunto en una pestaña nueva del navegador.
async function openAttachment(id) {
  const f = S.vault.index.files[id];
  if (!f) return;
  const tab = window.open('', '_blank');
  try {
    const url = blobUrl(await S.vault.readFile(id), f.type);
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  } catch (e) {
    tab?.close();
    notice(errText(e), 'error');
  }
}

// Enlace corto si el nombre es único; si no, con la ruta.
function embedTarget(path) {
  const name = baseName(path);
  const same = S.vault.files().filter((f) => baseName(f.path).toLowerCase() === name.toLowerCase());
  return same.length > 1 ? path : name;
}

function insertEmbed(path) {
  if (!S.current) return;
  if (S.mode !== 'edit') setMode('edit');
  const ed = $('editor');
  const s = ed.selectionStart;
  const before = ed.value.slice(0, s);
  const text = `${before && !before.endsWith('\n') ? '\n' : ''}![[${embedTarget(path)}]]\n`;
  applyEdit({ start: s, end: ed.selectionEnd, insert: text, selStart: s + text.length, selEnd: s + text.length });
}

function pastedName(file) {
  const ext = extOf(file.name) || ({ 'image/jpeg': 'jpg', 'application/pdf': 'pdf' }[file.type] || file.type.split('/')[1] || 'bin');
  // Las capturas pegadas llegan como "image.png": se les da un nombre con fecha y hora.
  if (!file.name || /^image\.\w+$/i.test(file.name)) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `Pegado ${isoDate(d)} ${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
  }
  return file.name;
}

async function attachFiles(files) {
  if (!S.vault || !S.current || !files.length) return;
  const vault = S.vault;
  const folder = WS.attachmentsFolder || '';
  for (const file of files) {
    $('st-sync').textContent = S.local ? 'Guardando adjunto…' : 'Cifrando y subiendo adjunto…';
    try {
      const { path } = await vault.addFile(folder, pastedName(file), new Uint8Array(await file.arrayBuffer()));
      if (S.vault !== vault) return;
      expandTo(path);
      insertEmbed(path);
    } catch (e) {
      notice(`No se pudo adjuntar «${file.name || 'imagen'}»: ${errText(e)}`, 'error');
    }
  }
  setStatus(S.dirty ? 'pending' : 'saved');
  renderTree();
}

async function deleteAttachment(id) {
  const f = S.vault.index.files[id];
  if (!f) return;
  const ok = await confirmModal('Eliminar adjunto', `¿Eliminar «${baseName(f.path)}»? Las notas que lo muestran dejarán de verlo.`, 'Eliminar', true);
  if (!ok) return;
  await run(() => S.vault.deleteFile(id));
  renderTree();
}

// --- Panel izquierdo: archivos, búsqueda y etiquetas ---
let leftTab = 'files';
function showLeftTab(tab) {
  leftTab = tab;
  document.querySelectorAll('.left-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  document.querySelectorAll('#left [data-pane]').forEach((el) => { el.hidden = el.dataset.pane !== tab; });
  if (tab === 'tags') renderTags();
  if (tab === 'bookmarks') renderBookmarks();
  if (tab === 'search') runSearch();
}

function showLeftPane(tab) {
  const app = $('app');
  if (isMobile()) {
    if (!app.classList.contains('mobile-left')) togglePanel('left');
  } else if (app.classList.contains('left-closed')) togglePanel('left');
  showLeftTab(tab);
}

function openSearch(text) {
  const app = $('app');
  if (isMobile()) {
    if (!app.classList.contains('mobile-left')) togglePanel('left');
  } else if (app.classList.contains('left-closed')) togglePanel('left');
  if (text != null) $('search-input').value = text;
  showLeftTab('search');
  const input = $('search-input');
  input.focus();
  input.select();
}

let searchTimer = null;
let searchSeq = 0;
async function runSearch() {
  const query = $('search-input').value;
  const seq = ++searchSeq;
  const box = $('search-results');
  const info = $('search-info');
  if (!query.trim()) {
    box.replaceChildren();
    info.hidden = false;
    return;
  }
  info.hidden = true;
  if (!S.indexReady || S.notesIdx.size < S.vault.notes().length) {
    const p = S.indexProgress;
    box.replaceChildren(h('p', { class: 'search-empty' }, p && p.total ? `Descifrando notas (${p.done} de ${p.total})…` : 'Descifrando notas…'));
  }
  await saveNow();
  await ensureIndex();
  if (seq !== searchSeq || !S.vault) return;
  syncIndex();
  const t0 = performance.now();
  const results = searchNotes(indexedNotes(), query);
  const ms = Math.round(performance.now() - t0);
  const total = results.reduce((a, r) => a + r.count, 0);
  const head = h('p', { class: 'search-count' }, results.length
    ? `${results.total} nota${results.total === 1 ? '' : 's'}${results.total > results.length ? ` (se muestran ${results.length})` : ''}${total ? ` · ${total} coincidencia${total === 1 ? '' : 's'}` : ''} · ${ms} ms`
    : 'Sin resultados');
  box.replaceChildren(head, ...results.map((r) => h('div', { class: 'search-result', role: 'listitem' },
    h('button', { class: 'search-note', type: 'button', title: r.note.path, onclick: () => openResult(r.note.id) },
      h('span', { class: 'search-name' }, r.note.name),
      r.note.folder ? h('span', { class: 'search-folder' }, r.note.folder) : null),
    ...r.matches.map((m) => h('button', { class: 'search-line', type: 'button', onclick: () => openResult(r.note.id, m) }, ...marked(m))),
  )));
}

// Texto del fragmento con <mark> en lo encontrado (siempre como texto, nunca HTML).
function marked(m) {
  const out = [];
  let at = 0;
  for (const [a, b] of m.marks) {
    if (a < at) continue;
    if (a > at) out.push(m.text.slice(at, a));
    out.push(h('mark', {}, m.text.slice(a, b)));
    at = b;
  }
  out.push(m.text.slice(at));
  return out;
}

async function openResult(id, match) {
  closeMobilePanels();
  if (S.current !== id) await openNote(id);
  if (!match || S.current !== id) return;
  if (S.mode === 'read') setMode('edit');
  const ed = $('editor');
  ed.focus();
  ed.setSelectionRange(match.offset, match.offset + match.length);
  const lineHeight = parseFloat(getComputedStyle(ed).lineHeight) || 26;
  const c = caretBox(match.offset);
  $('view').scrollTop = Math.max(0, ed.offsetTop + c.top - lineHeight * 4);
}

async function renderTags() {
  const list = $('tag-list');
  if (!S.vault) return;
  if (!S.indexReady) list.replaceChildren(h('p', { class: 'search-empty' }, 'Descifrando notas…'));
  await ensureIndex();
  if (!S.vault || leftTab !== 'tags') return;
  syncIndex();
  const tags = tagCounts(indexedNotes());
  list.replaceChildren(...(tags.length
    ? tags.map(({ tag, count }) => h('button', { class: 'tag-row', type: 'button', role: 'listitem', onclick: () => openSearch(`tag:#${tag}`) },
      h('span', { class: 'tag-name' }, `#${tag}`), h('span', { class: 'tag-count' }, String(count))))
    : [h('p', { class: 'search-empty' }, 'Todavía no hay etiquetas. Escribe #algo en una nota.')]));
}

function closeMobilePanels() {
  $('app').classList.remove('mobile-left', 'mobile-right');
  $('backdrop').hidden = true;
}

function togglePanel(side) {
  const app = $('app');
  if (isMobile()) {
    const cls = side === 'left' ? 'mobile-left' : 'mobile-right';
    const open = !app.classList.contains(cls);
    app.classList.remove('mobile-left', 'mobile-right');
    app.classList.toggle(cls, open);
    $('backdrop').hidden = !open;
    return;
  }
  app.classList.toggle(`${side}-closed`);
  try {
    localStorage.setItem(`snowlog.${side}Closed`, app.classList.contains(`${side}-closed`) ? '1' : '');
  } catch { /* sin almacenamiento */ }
}

function noteMenu(x, y) {
  const items = [];
  if (S.current) {
    const id = S.current;
    items.push(['rename', 'Renombrar', () => renameNotePrompt(id)], ['move', 'Mover a…', () => moveNotePrompt(id)], ['history', 'Historial de versiones…', () => historyModal(id)],
      ['bookmark', isBookmarked(id) ? 'Quitar de marcadores' : 'Añadir a marcadores', () => toggleBookmark(id)]);
  }
  if (S.current) items.push(['template', 'Insertar plantilla…', () => insertTemplate()], ['import', 'Adjuntar imagen o PDF…', () => $('attach-input').click()]);
  items.push(
    ['command', 'Paleta de comandos (Ctrl+P)', () => commandPalette()],
    ['filePlus', 'Nueva nota', () => newNote()],
    ['template', 'Nueva nota desde plantilla…', () => newFromTemplate()],
    ['kanban', 'Nuevo tablero Kanban', () => newBoard()],
    ['graph', 'Vista de grafo (Ctrl+G)', () => graphView()],
    null,
    ['today', 'Nota de hoy (Ctrl+D)', () => openDaily()],
    ['home', 'Panel principal', () => openHome()],
    ['setup', 'Configurar mi espacio…', () => setupSpace()],
    ['example', 'Cargar ejemplos…', () => loadExamples()],
    ['import', 'Importar carpeta…', () => ACTIONS.import()],
    ['download', S.local ? 'Copia de seguridad (.zip)' : 'Copia de seguridad cifrada', () => backupNow()],
  );
  if (!S.local) items.push(['download', 'Exportar sin cifrar (.zip)', () => exportZip()]);
  items.push(['import', 'Importar copia (.snowlog o .zip)…', () => $('backup-input').click()]);
  items.push(['settings', 'Ajustes…', () => settingsModal()]);
  if (S.local) items.push(['collapse', 'Recargar la carpeta', () => reloadLocal()]);
  else items.push(['key', 'Frase de paso y recuperación…', () => securityModal()]);
  if (S.current) items.push(null, ['trash', 'Eliminar nota', () => deleteNote(S.current), 'danger']);
  items.push(null,
    ['lock', S.local ? 'Cerrar carpeta' : 'Bloquear', () => lock()],
    ['logout', S.local ? 'Olvidar esta carpeta' : 'Cerrar sesión', () => logout()]);
  openMenu(x, y, items);
}

// --- Acciones y atajos ---
const ACTIONS = {
  graph: () => graphView(),
  palette: () => commandPalette(),
  settings: () => settingsModal(),
  'toggle-left': () => togglePanel('left'),
  'toggle-right': () => togglePanel('right'),
  switcher: () => quickSwitcher(),
  'new-note': () => newNote(),
  'new-folder': () => newFolder(''),
  import: () => { if (S.vault) $('import-input').click(); },
  today: () => openDaily(),
  home: () => openHome(),
  'collapse-all': () => { S.expanded.clear(); saveExpanded(); renderTree(); },
  'toggle-mode': () => S.current && setMode(S.mode === 'edit' ? 'read' : 'edit'),
  'note-menu': (btn) => { const r = btn.getBoundingClientRect(); noteMenu(r.right - 200, r.bottom + 4); },
  lock: () => lock(),
  logout: () => logout(),
};

const BUTTON_ICONS = {
  'toggle-left': 'files', switcher: 'search', 'new-note': 'filePlus', 'new-folder': 'folderPlus', 'collapse-all': 'collapse', import: 'import', today: 'today', home: 'home',
  lock: 'lock', logout: 'logout', settings: 'settings', palette: 'command', graph: 'graph', 'note-menu': 'more', 'toggle-right': 'sidebarRight', 'toggle-mode': 'read',
};

function setupUi() {
  document.querySelectorAll('[data-action]').forEach((btn) => {
    if (!btn.classList.contains('link-btn') && BUTTON_ICONS[btn.dataset.action]) {
      btn.innerHTML = trusted(icon(btn.classList.contains('mobile-only') ? 'menu' : BUTTON_ICONS[btn.dataset.action]));
    }
    btn.addEventListener('click', () => ACTIONS[btn.dataset.action]?.(btn));
  });
  const app = $('app');
  if (localStorage.getItem('snowlog.leftClosed')) app.classList.add('left-closed');
  if (localStorage.getItem('snowlog.rightClosed')) app.classList.add('right-closed');
  $('backdrop').addEventListener('click', closeMobilePanels);

  const tabIcons = { files: 'files', search: 'search', tags: 'tag', bookmarks: 'bookmark' };
  setupHoverPreview();
  document.querySelectorAll('.left-tab').forEach((b) => {
    b.innerHTML = trusted(icon(tabIcons[b.dataset.tab]));
    b.addEventListener('click', () => showLeftTab(b.dataset.tab));
  });
  $('search-input').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 150);
  });
  $('search-input').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      $('search-results').querySelector('.search-line, .search-note')?.click();
    }
  });

  const editor = $('editor');
  editor.addEventListener('input', () => {
    scheduleSave();
    autosize();
    clearTimeout(sideTimer);
    sideTimer = setTimeout(refreshSide, 300);
  });
  editor.addEventListener('keydown', editorKeydown);
  editor.addEventListener('paste', (ev) => {
    const files = [...(ev.clipboardData?.files || [])];
    if (!files.length) return;
    ev.preventDefault();
    attachFiles(files);
  });
  editor.addEventListener('dragover', (ev) => {
    if (ev.dataTransfer?.types.includes('Files')) ev.preventDefault();
  });
  editor.addEventListener('drop', (ev) => {
    const files = [...(ev.dataTransfer?.files || [])];
    if (!files.length) return;
    ev.preventDefault();
    attachFiles(files);
  });
  // Un fichero soltado fuera del editor no debe sacar al navegador de Snowlog.
  for (const type of ['dragover', 'drop']) {
    window.addEventListener(type, (ev) => {
      if (ev.dataTransfer?.types.includes('Files') && !ev.defaultPrevented) ev.preventDefault();
    });
  }
  $('backup-input').addEventListener('change', (ev) => {
    const [file] = ev.target.files;
    ev.target.value = '';
    if (file && S.vault) restoreBackup(file);
  });
  $('attach-input').addEventListener('change', (ev) => {
    const files = [...ev.target.files];
    ev.target.value = '';
    attachFiles(files);
  });
  editor.addEventListener('input', updateSuggest);
  editor.addEventListener('click', updateSuggest);
  editor.addEventListener('blur', () => setTimeout(closeSuggest, 150));

  const title = $('title');
  title.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      editor.focus();
    } else if (ev.key === 'Escape') {
      updateHeader();
      title.value = baseName(S.vault.index.notes[S.current].path);
      editor.focus();
    }
  });
  title.addEventListener('blur', commitTitle);

  $('reading').addEventListener('change', (ev) => {
    const box = ev.target.closest('input.task-checkbox');
    if (box) toggleTask(box);
  });
  $('reading').addEventListener('click', (ev) => {
    const link = ev.target.closest('a.internal-link');
    if (!link) return;
    ev.preventDefault();
    openByTitle(link.dataset.target);
  });

  document.addEventListener('pointerdown', (ev) => {
    if (!$('menu').hidden && !ev.target.closest('#menu')) closeMenu();
  });
  document.addEventListener('keydown', (ev) => {
    if (!$('menu').hidden && (ev.key === 'Escape' || ((ev.ctrlKey || ev.metaKey) && !ev.target.closest?.('#menu')))) closeMenu();
    if (!S.vault || $('app').hidden || $('modal-root').childElementCount) return;
    const mod = ev.ctrlKey || ev.metaKey;
    if (!mod || ev.altKey) return;
    const k = ev.key.toLowerCase();
    if (k === 'f' && ev.shiftKey) { ev.preventDefault(); openSearch(); return; }
    if (k === 'e') { ev.preventDefault(); ACTIONS['toggle-mode'](); }
    else if (k === 'o') { ev.preventDefault(); quickSwitcher(); }
    else if (k === 'p') { ev.preventDefault(); commandPalette(); }
    else if (k === 'g') { ev.preventDefault(); graphView(); }
    else if (k === 'n') { ev.preventDefault(); newNote(); }
    else if (k === 's') { ev.preventDefault(); saveNow(); }
    else if (k === 'd') { ev.preventDefault(); openDaily(); }
  });

  addEventListener('online', () => trySync());
  addEventListener('focus', () => rescanLocal());
  setInterval(() => rescanLocal(), 10000);
  addEventListener('offline', () => { if (S.vault && !S.local) { S.vault.offline = true; updatePlace(); } });
  setInterval(() => { if (S.vault?.offline && navigator.onLine) trySync(); }, 30000);
  // Al cambiar de pestaña o de app (móvil) se guarda enseguida.
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.dirty) saveNow(); });
  addEventListener('beforeunload', (ev) => {
    if (S.dirty) {
      saveNow();
      ev.preventDefault();
    }
  });
  addEventListener('resize', () => { if (!isMobile()) closeMobilePanels(); });
  setupTree();
  $('import-input').addEventListener('change', async (ev) => {
    const files = [...ev.target.files];
    ev.target.value = '';
    if (files.length && S.vault) await importFolder(files);
  });
}

// ---------------------------------------------------------------------------
// La web se guarda para abrirse sin conexión (solo en la versión online servida por https o localhost).
function registerServiceWorker() {
  if (CONFIG.mode !== 'online' || !('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  navigator.serviceWorker.register(TT ? TT.createScriptURL('sw.js') : 'sw.js').catch(() => {});
}

async function boot() {
  applyTheme();
  // GitHub Pages no permite la cabecera frame-ancestors: si alguien mete Snowlog en un iframe
  // (para engañar con clics encima), no arranca.
  if (window.top !== window.self) {
    document.body.textContent = 'Snowlog no se puede abrir dentro de otra página.';
    return undefined;
  }
  registerServiceWorker();
  setupUi();
  trackActivity();
  if (CONFIG.mode === 'portable') {
    showLocalStart();
    return undefined;
  }
  try {
    const cred = await Auth.finishOAuth();
    if (cred) {
      S.cred = cred;
      return afterAuth(null, null);
    }
  } catch (e) {
    return showLogin(errText(e));
  }
  const cached = Auth.cachedVault();
  if (cached) showUnlock(cached);
  else showLogin();
}

boot();
