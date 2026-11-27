// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// Snowlog: main interface.
import { CONFIG } from './config.js';
import { pickLang, translator, fill, LANGS, LANG_NAMES } from './i18n.js';
import { WELCOMES } from './welcome.js';
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
import { createEditor as createSketch } from './sketch-editor.js';
import { emptyScene as emptySketch, parseScene as parseSketch, serializeScene as serializeSketch, mergeScenes as mergeSketch } from './sketch-scene.js';
import { toSvgElement as sketchSvg } from './sketch-render.js';
import { TEMPLATES as SKETCH_TEMPLATES, template as sketchTemplate } from './sketch-templates.js';
import { merge3 } from './merge.js';
import { openKvDir, browserBackend } from './kvdir.js';
import { buildGraph, localGraph, initLayout, step as graphStep } from './graph.js';
import { parseNote, toggleTaskLine, linksTo, contentLines, TASK_LINE_RE } from './noteindex.js';
import { parseQuery, runQuery, renderResult } from './query.js';
import { applyTemplate, dailyPath, isoDate, parseIsoDate, DAILY_TEMPLATE, starterSpace, formatDate, workspaceSettings } from './templates.js';

// The interface's language: the one chosen in Settings (on this device), or the browser's (English if it isn't one
// we have). tr('English text') gives it in that language.
const LANG = pickLang((() => { try { return localStorage.getItem('snowlog.lang') || 'auto'; } catch { return 'auto'; } })(), navigator.languages || [navigator.language]);
const tr = translator(LANG);
// tr() with {holes} filled; trn() with the singular or plural text by n ({n} is filled too).
const trf = (s, vars) => fill(tr(s), vars);
const trn = (n, one, many, vars = {}) => fill(tr(n === 1 ? one : many), { n, ...vars });
document.documentElement.lang = LANG;

// ---------------------------------------------------------------------------
// Icons (our own line strokes)
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
  sketch: 'M3 17c3-4 5-9 8-9s1 9 4 9 4-6 6-8 M15 4l5 5',
  graph: 'M6 7a2 2 0 1 0 0-.1z M18 6a2 2 0 1 0 0-.1z M12 18a2 2 0 1 0 0-.1z M7.5 7.8l3.4 8.6 M16.6 7.4l-3.6 8.9 M8 6.3h8',
  command: 'M4 6l5 6-5 6 M12 18h8',
  settings: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1',
  settings: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1',
  key: 'M14 10a4 4 0 1 0-1.2 2.8L20 20 M17 17l2-2',
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;

// Trusted Types: the CSP only lets HTML in through this policy. It only receives HTML that has
// already been escaped (markdown.js, editor.js, query.js) or our own icons; never raw note text.
const TT = globalThis.trustedTypes?.createPolicy('snowlog', {
  createHTML: (s) => s,
  // The only script loaded by hand is the service worker.
  createScriptURL: (u) => {
    if (u !== 'sw.js') throw new Error('script_not_allowed');
    return u;
  },
});
const trusted = (s) => (TT ? TT.createHTML(s) : s);

const $ = (id) => document.getElementById(id);
// The open drawing (if any) and its pending save.
const D = { id: null, editor: null, timer: 0, dirty: false, saving: Promise.resolve() };
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
// State
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
  local: false, // true = notes in a local folder or in the browser (no GitHub)
  notesIdx: new Map(), // id -> parsed note (memory only)
  drawText: new Map(), // drawing id -> { ver, note } with its text, for search (memory only)
  indexReady: null,
  calMonth: null,
};
// Settings in force: config.js as the base, the vault's own ("Settings" in the app) on top.
const DEFAULTS = { ...(CONFIG.workspace || {}), lockAfterMinutes: CONFIG.lockAfterMinutes, backupReminderDays: CONFIG.backupReminderDays };
const WS = { ...DEFAULTS };
function applySettings() {
  for (const k of Object.keys(WS)) delete WS[k];
  Object.assign(WS, workspaceSettings(DEFAULTS, S.vault?.getSettings?.() || {}, S.vault?.index));
}

// This device's theme: automatic (the system's), light or dark.
function applyTheme(theme = (() => { try { return localStorage.getItem('snowlog.theme') || 'auto'; } catch { return 'auto'; } })()) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  if (D.editor) sketchTheme(D.editor.root);
}

const isMobile = () => matchMedia('(max-width: 760px)').matches;

// ---------------------------------------------------------------------------
// Readable error messages
function errText(e) {
  const m = e?.message || '';
  const map = {
    exists: 'A note or folder with that name already exists.',
    empty_name: 'The name cannot be empty.',
    bad_chars: 'The name cannot contain \\ : * ? " < > | # ^ [ ]',
    name_too_long: 'The name is too long.',
    into_itself: 'You cannot move a folder into itself.',
    bad_secret: 'That is not right. Check it and try again.',
    missing_note: 'This note\'s encrypted file is missing from the repository (it may have been deleted there). Nothing was changed: restore it from the note\'s history or the repository.',
    bad_vault: 'The vault file (.snowlog/vault.json) on GitHub has been changed or is damaged: Snowlog will not use it. Check the repository\'s history.',
    rolled_back: 'The vault file (.snowlog/vault.json) on GitHub is older than the one this device last opened: it may have been put back on purpose. Snowlog will not use it. Check the repository\'s history.',
    bad_state: 'The sign-in is not valid. Try again.',
    oauth_denied: 'You cancelled the access on GitHub.',
    no_worker: 'The sign-in service (authWorker) is not configured.',
    session_expired: 'The GitHub session has expired. Sign in again.',
    vault_exists: 'There is already a vault in the repository.',
    key_changed: 'The encryption key was changed on another device. Unlock again with your passphrase.',
    pending: 'There are changes not uploaded yet. Wait until you are online and they are uploaded before changing the key.',
    busy: 'Another device saved in the meantime. Nothing was changed: try again.',
    offline: 'Offline: this can be done when the network is back. What you write in your notes is still saved.',
    bad_backup: 'That file is not a Snowlog backup, or it is damaged.',
    bad_zip: 'The backup content is damaged.',
    bad_file: 'That file is not a sketch or Excalidraw drawing.',
    zip_compressed: 'This .zip is compressed and cannot be read here. Unzip it and use “Import folder”.',
    bad_type: 'Only images (png, jpg, gif, webp, avif, bmp) and PDFs can be attached.',
    too_big: 'The attachment is too large (20 MB at most).',
  };
  if (map[m]) return tr(map[m]);
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') return tr('The browser did not give permission to use the folder.');
  if (e?.name === 'NotFoundError') return tr('The file or folder cannot be found. Was it moved or deleted outside Snowlog?');
  if (e?.name === 'QuotaExceededError') return tr('There is no space left in the browser storage.');
  if (e?.status === 401) return tr('GitHub refused access: the session or the token has expired.');
  if (e?.status === 403) return tr('GitHub denies permission. Check that the access includes the notes repository with write permission.');
  if (e?.status === 404) return trf('{repo} cannot be found. Check that it exists and that you have access.', { repo: `${CONFIG.notesRepo.owner}/${CONFIG.notesRepo.repo}` });
  if (e?.status === 409) return tr('Another device saved at the same time. Try again.');
  if (e instanceof TypeError) return tr('No connection to GitHub.');
  return m || tr('Something went wrong.');
}

function notice(text, kind = '') {
  const el = h('div', { class: `notice ${kind}` }, text);
  $('notices').append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 7000 : 3500);
}

// ---------------------------------------------------------------------------
// Sign-in screens
function lockScreen(...children) {
  $('app').hidden = true;
  $('lock').hidden = false;
  const card = $('lock-card');
  card.replaceChildren(
    h('div', { class: 'lock-logo' }, h('img', { src: 'icon.svg', alt: '' }), h('span', {}, tr('Snowlog'))),
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
  const tokenInput = h('input', { class: 'input', type: 'password', id: 'pat', autocomplete: 'off', placeholder: tr('github_pat_…') });
  const tokenForm = h('form', { hidden: true },
    h('div', { class: 'field' }, h('label', { for: 'pat' }, tr('Personal token (fine-grained, only the notes repository)')), tokenInput),
    h('button', { class: 'btn primary', type: 'submit' }, tr('Continue')));
  tokenForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!tokenInput.value.trim()) return;
    S.cred = Auth.patCred(tokenInput.value);
    tokenInput.value = '';
    await afterAuth(err, tokenForm.querySelector('button'));
  });

  const githubBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => Auth.startOAuth() }, tr('Sign in with GitHub'));
  const oauthHint = Auth.oauthAvailable() ? null
    : h('p', { class: 'hint' }, tr('Sign-in with GitHub is not set up yet. For now, use a personal token.'));
  if (oauthHint) githubBtn.disabled = true;

  lockScreen(
    h('h1', {}, tr('Your encrypted notebook')),
    h('p', {}, message || tr('Sign in with your GitHub account to open your notes.')),
    githubBtn,
    oauthHint,
    h('div', { class: 'lock-links' },
      h('button', { class: 'link-btn', type: 'button', onclick: () => { tokenForm.hidden = false; tokenInput.focus(); } }, tr('Use a personal token')),
      h('button', { class: 'link-btn', type: 'button', onclick: () => showLocalStart() }, tr('Use notes on this computer, without GitHub')),
      h('a', { class: 'link-btn', href: 'snowlog-portable.html', download: 'snowlog-portable.html' }, tr('Download the portable version'))),
    tokenForm,
    err,
  );
}

// ---------------------------------------------------------------------------
// Local mode: a folder on the computer or the browser's storage (no network)
// Encrypted cache of the configured repository's notes (ciphertext only, as on GitHub).
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
// Browser storage does not exist for files opened from disk (file://).
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
  // Firefox, Safari (and Chrome opening the file from disk): without folders or OPFS, notes can
  // still be stored inside the browser (IndexedDB or localStorage).
  const kv = browserOk ? null : await browserBackend();
  const inside = kv && h('button', { class: `btn${canPickFolder() ? '' : ' primary'}`, type: 'button' }, tr('Store inside the browser'));
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
      h('h1', {}, tr('Your notes, in this browser')),
      h('p', {}, tr('This browser does not let you pick folders on disk (only Chrome and Edge do). Notes are stored inside the browser, on this computer, and are still here the next time you open this file.')),
      inside,
      h('p', { class: 'hint' }, tr('To take them elsewhere or keep a copy, use “Backup (.zip)” in the ⋯ menu. If you clear the browser data, the notes are cleared too.')),
      CONFIG.mode === 'portable' ? null
        : h('div', { class: 'lock-links' }, h('button', { class: 'link-btn', type: 'button', onclick: () => showLogin() }, tr('Back to signing in with GitHub'))),
      err,
    );
    return;
  }
  if (!canPickFolder() && !browserOk) {
    lockScreen(
      h('h1', {}, tr('Open Snowlog with Chrome or Edge')),
      h('p', {}, tr('This browser cannot store notes from a file opened from disk. Open snowlog-portable.html with Google Chrome or Microsoft Edge (right click → Open with).')),
      CONFIG.mode === 'portable' ? null
        : h('div', { class: 'lock-links' }, h('button', { class: 'link-btn', type: 'button', onclick: () => showLogin() }, tr('Back to signing in with GitHub'))),
    );
    return;
  }
  const pick = h('button', { class: 'btn primary', type: 'button' }, remembered ? tr('Choose another folder') : tr('Open a folder'));
  pick.addEventListener('click', async () => {
    try {
      const handle = await window.showDirectoryPicker({ id: 'snowlog', mode: 'readwrite' });
      await rememberHandle(handle);
      await openLocal(handle, 'folder', pick);
    } catch (e) {
      if (e?.name !== 'AbortError') showError(err, e);
    }
  });
  const again = remembered && h('button', { class: 'btn primary', type: 'button' }, trf('Continue with “{name}”', { name: remembered.name }));
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
  const browser = h('button', { class: `btn${canPickFolder() ? '' : ' primary'}`, type: 'button' }, tr('Store in this browser'));
  browser.addEventListener('click', async () => {
    try {
      await openLocal(await navigator.storage.getDirectory(), 'browser', browser);
    } catch (e) {
      showError(err, e);
    }
  });
  lockScreen(
    h('h1', {}, tr('Your notes, on this computer')),
    h('p', {}, canPickFolder()
      ? tr('Choose a folder: each note is a plain .md file. Nothing leaves your computer.')
      : tr('This browser does not let you pick folders (use Chrome or Edge for that). You can store notes inside the browser and export them as a .zip whenever you want.')),
    again || null,
    canPickFolder() ? pick : null,
    browserOk ? browser : inside,
    h('p', { class: 'hint' }, tr('No internet and nothing to install. Notes are not encrypted: they are protected by your computer account.')),
    CONFIG.mode === 'portable' ? null
      : h('div', { class: 'lock-links' }, h('button', { class: 'link-btn', type: 'button', onclick: () => showLogin() }, tr('Back to signing in with GitHub'))),
    err,
  );
}

async function openLocal(handle, kind, button) {
  const done = button ? busy(button, tr('Opening…')) : () => {};
  try {
    const vault = await new LocalVault(handle, { kind, label: kind === 'folder' ? handle.name : 'this browser' }).load();
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
  notice(tr('Folder reloaded.'));
}

// Every note and attachment, to export or copy: [{ path, text }] and [{ path, data }].
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

// --- Backups ---
// Only the date of the last backup is remembered (nothing secret), to warn if too much time passes.
const backupKey = () => `snowlog.backup.${S.local ? 'local' : `${CONFIG.notesRepo.owner}/${CONFIG.notesRepo.repo}`}`;
function backupState() {
  try {
    return JSON.parse(localStorage.getItem(backupKey()) || 'null') || {};
  } catch {
    return {};
  }
}
function saveBackupState(st) {
  try { localStorage.setItem(backupKey(), JSON.stringify(st)); } catch { /* no storage */ }
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
    st.last ? trf('Your last backup was {n} days ago. ', { n: Math.floor((now - st.last) / 86400000) }) : tr('You have not made a backup yet. '),
    h('button', { class: 'link-btn', type: 'button', onclick: () => { n.remove(); backupNow(); } }, tr('Back up now')),
    ' · ',
    h('button', { class: 'link-btn', type: 'button', onclick: () => { n.remove(); saveBackupState({ ...backupState(), snoozed: Date.now() }); } }, tr('Tomorrow')));
  $('notices').append(n);
  setTimeout(() => n.remove(), 30000);
}

// Online: an encrypted .snowlog file (opens with the passphrase or the code). Local: a .zip with the .md files.
async function backupNow() {
  if (!S.vault) return;
  if (S.local) return exportZip();
  await saveNow();
  setStatus('');
  $('st-sync').textContent = tr('Preparing the encrypted backup…');
  try {
    const files = await collectFiles();
    const vaultFile = (await Vault.fetchVaultFile(S.repo).catch(() => null)) || S.vaultFile;
    download(await makeBackup(vaultFile, S.dek, files), `snowlog-backup-${isoDate(new Date())}.snowlog`, 'application/octet-stream');
    saveBackupState({ ...backupState(), last: Date.now() });
    notice(trf('Encrypted backup downloaded: {n} files. It opens with your passphrase or your recovery code.', { n: files.length }));
  } catch (e) {
    notice(errText(e), 'error');
  } finally {
    $('st-sync').textContent = '';
  }
}

// Opens a backup to import it: .snowlog (encrypted, from the online version) or .zip (from the portable
// version or from "Export unencrypted"). This is how notes move from one version to the other.
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
    opened = await keyChangeForm(tr('Open backup'),
      trn(meta.notes, 'Backup from {when} with 1 note. It opens with the passphrase you had then or with the recovery code.', 'Backup from {when} with {n} notes. It opens with the passphrase you had then or with the recovery code.', { when }),
      [passField('bk0', tr('Passphrase or recovery code'))],
      tr('Open'),
      async ([secret]) => openBackup(bytes, secret));
    if (!opened) return;
  }
  const hiddenPath = (p) => p.split('/').some((part) => part.startsWith('.'));
  const count = opened.files.filter((f) => /\.md$/i.test(f.path) && !hiddenPath(f.path)).length;
  if (!opened.files.length) return notice(tr('The backup is empty.'), 'error');
  const folder = `Backup ${isoDate(new Date(created))}`;
  const action = await pickModal(trn(count, '1 note in the backup. What should we do?', '{n} notes in the backup. What should we do?'), [
    { label: trf('Import them into the “{folder}” folder', { folder }), sub: tr('Your current notes are not touched'), value: 'folder' },
    { label: tr('Import them as they are, with their folders'), sub: tr('To move everything from one version to the other. If a name already exists, “(imported)” is added'), value: 'root' },
    !isZip && { label: tr('Download it as an unencrypted .zip'), sub: tr('To open it with any editor'), value: 'zip' },
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
    st.textContent = trf('Importing {d}/{t}…', { d: 0, t: notes.length });
    const result = await S.vault.importNotes(notes, { message: 'restore backup', onProgress: (d, t) => { S.lastActivity = Date.now(); st.textContent = trf('Importing {d}/{t}…', { d, t }); } });
    let skipped = 0;
    for (const f of others) {
      try {
        await S.vault.addFile(parentPath(at(f.path)), baseName(f.path), f.data);
      } catch { skipped += 1; }
    }
    if (target) S.expanded.add(target);
    renderTree();
    syncIndex();
    notice(trf(target ? (others.length ? 'Backup imported into “{target}”: {n} notes and {a} attachments.' : 'Backup imported into “{target}”: {n} notes.') : (others.length ? 'Backup imported: {n} notes and {a} attachments.' : 'Backup imported: {n} notes.'), { target, n: result.length, a: others.length - skipped }));
  } catch (e) {
    renderTree();
    notice(trf('The import stopped: {error}. What was already imported is kept.', { error: errText(e) }), 'error');
  } finally {
    st.textContent = '';
  }
}

async function exportZip() {
  if (!S.vault) return;
  if (!S.local) {
    const ok = await confirmModal(tr('Export unencrypted copy'),
      tr('The .zip will hold all your notes in plaintext. Keep it somewhere safe.'), tr('Export'), false);
    if (!ok) return;
  }
  await saveNow();
  setStatus('');
  $('st-sync').textContent = tr('Preparing the copy…');
  try {
    const files = await collectFiles();
    download(makeZip(files), `snowlog-${isoDate(new Date())}.zip`, 'application/zip');
    if (S.local) saveBackupState({ ...backupState(), last: Date.now() });
    notice(trf('Copy exported: {n} files.', { n: files.length }));
  } catch (e) {
    notice(errText(e), 'error');
  } finally {
    $('st-sync').textContent = '';
  }
}

// Once there are credentials: check the repository and open or create the vault.
async function afterAuth(errEl, button) {
  const done = button ? busy(button, tr('Connecting…')) : () => {};
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
  const [f1, p1] = passField('p1', tr('Passphrase (at least 12 characters)'), 'new-password');
  const [f2, p2] = passField('p2', tr('Repeat the passphrase'), 'new-password');
  const btn = h('button', { class: 'btn primary', type: 'submit' }, tr('Create encrypted vault'));
  const form = h('form', {}, f1, f2, btn, err);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (p1.value.length < 12) return showError(err, tr('Use at least 12 characters. A phrase of several words is best.'));
    if (p1.value !== p2.value) return showError(err, tr('The two passphrases do not match.'));
    const done = busy(btn, tr('Encrypting and creating…'));
    try {
      const { vault, vaultFile, recoveryCode } = await Vault.create(S.repo, p1.value, CONFIG.kdfIterations, { welcome: WELCOMES[LANG] });
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
    h('h1', {}, tr('Create your vault')),
    h('p', {}, tr('Your notes are encrypted on this device with this passphrase before they go up to GitHub. It never leaves this device: if you lose it, only the recovery code can open your notes.')),
    form,
  );
}

function showRecoveryCode(code) {
  const check = h('input', { type: 'checkbox', id: 'saved' });
  const btn = h('button', { class: 'btn primary', type: 'button', disabled: true, onclick: () => enterApp() }, tr('Enter Snowlog'));
  check.addEventListener('change', () => { btn.disabled = !check.checked; });
  lockScreen(
    h('h1', {}, tr('Save your recovery code')),
    h('p', {}, tr('It is the only way to recover your notes if you forget the passphrase. Write it on paper and keep it somewhere safe. It will not be shown again.')),
    h('div', { class: 'recovery-code' }, code),
    h('label', { class: 'check', for: 'saved' }, check, tr('I have kept it somewhere safe')),
    btn,
  );
}

function showUnlock(vaultFile, { fresh = false, message = '' } = {}) {
  const err = errorLine();
  if (message) showError(err, message);
  const [f1, p1] = passField('pp', tr('Passphrase'));
  const btn = h('button', { class: 'btn primary', type: 'submit' }, tr('Unlock'));
  const form = h('form', {}, f1, btn, err);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const done = busy(btn, tr('Decrypting…'));
    try {
      const pass = p1.value;
      const opened = await C.openVault(vaultFile, pass);
      if (opened.epoch < Auth.knownEpoch()) throw new Error('rolled_back');
      S.dek = opened.dek;
      Auth.rememberEpoch(opened.epoch);
      p1.value = '';
      S.vaultFile = vaultFile;
      await afterUnlock(fresh, pass);
    } catch (e) {
      S.dek = null;
      done();
      showError(err, e);
    }
  });
  lockScreen(
    h('h1', {}, tr('Unlock your notes')),
    h('p', {}, trf('Vault in {repo}.', { repo: `${CONFIG.notesRepo.owner}/${CONFIG.notesRepo.repo}` })),
    form,
    h('div', { class: 'lock-links' },
      h('button', { class: 'link-btn', type: 'button', onclick: () => showRecover(vaultFile, fresh) }, tr('I forgot the passphrase')),
      h('button', { class: 'link-btn', type: 'button', onclick: () => forgetAndLogin() }, tr('Use another account or forget this device'))),
  );
}

// With the DEK already decrypted: recover the stored credentials if needed, and open.
async function afterUnlock(fresh, pass = null) {
  if (!fresh) {
    S.cred = await Auth.loadCred(S.dek);
    if (!S.cred) {
      S.dek = null;
      return showLogin(tr('This device\'s session has expired. Sign in again.'));
    }
    S.repo = makeRepo();
    if (Auth.needsRefresh(S.cred)) {
      try {
        await renewToken();
      } catch (e) {
        // Offline, it still opens with what is stored on this device; the token is refreshed when back online.
        if (!(e instanceof TypeError)) {
          S.dek = null;
          S.cred = null;
          return showLogin(errText(e));
        }
      }
    }
    // Updates the local copy of vault.json in case it changed on another device.
    try {
      const remote = await Vault.fetchVaultFile(S.repo);
      if (remote) {
        // If the passphrase was changed or the key rotated on another device, it opens with the new vault.json.
        // A lower epoch than this device has opened (or the same one with a different key) is a rollback: it is
        // not used, and the notes stay with the key this device trusts.
        let use = true;
        if (pass && JSON.stringify(remote.keys.passphrase) !== JSON.stringify(S.vaultFile.keys.passphrase)) {
          let opened = null;
          try {
            opened = await C.openVault(remote, pass);
          } catch (e) {
            if (e.message === 'bad_vault') {
              use = false;
              notice(errText(e), 'error');
            } else {
              S.dek = null;
              Auth.cacheVault(remote);
              return showUnlock(remote, { message: tr('The passphrase was changed on another device: use the new one.') });
            }
          }
          if (opened) {
            const known = Auth.knownEpoch();
            if (opened.epoch < known || (opened.epoch === known && known > 0)) {
              use = false;
              notice(errText(new Error('rolled_back')), 'error');
            } else {
              S.dek = opened.dek;
              Auth.rememberEpoch(opened.epoch);
            }
          }
        }
        if (use) {
          Auth.cacheVault(remote);
          S.vaultFile = remote;
        }
      }
    } catch { /* carry on with the local copy */ }
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
  const code = h('input', { class: 'input', id: 'rc', autocomplete: 'off', spellcheck: 'false', placeholder: tr('XXXXX-XXXXX-XXXXX-XXXXX-XXXXX') });
  const [f1, p1] = passField('n1', tr('New passphrase (at least 12 characters)'), 'new-password');
  const [f2, p2] = passField('n2', tr('Repeat the new passphrase'), 'new-password');
  const btn = h('button', { class: 'btn primary', type: 'submit' }, tr('Change the passphrase and enter'));
  const form = h('form', {}, h('div', { class: 'field' }, h('label', { for: 'rc' }, tr('Recovery code')), code), f1, f2, btn, err);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (p1.value.length < 12) return showError(err, tr('Use at least 12 characters.'));
    if (p1.value !== p2.value) return showError(err, tr('The two passphrases do not match.'));
    const done = busy(btn, tr('Recovering…'));
    try {
      const { vault: updated, dek, epoch } = await C.recoverVault(vaultFile, code.value, p1.value, { iterations: CONFIG.kdfIterations, knownEpoch: Auth.knownEpoch() });
      Auth.rememberEpoch(epoch);
      S.dek = dek;
      if (!fresh) {
        S.cred = await Auth.loadCred(dek);
        if (!S.cred) throw new Error('session_expired');
        S.repo = makeRepo();
      }
      S.vault = new Vault(S.repo, dek, { store: noteCache() });
      await S.vault.writeVaultFile(updated);
      await keepVaultFile(updated);
      await Auth.saveCred(dek, S.cred);
      await S.vault.loadIndex();
      notice(tr('Passphrase changed.'));
      enterApp();
    } catch (e) {
      S.dek = null;
      done();
      showError(err, e);
    }
  });
  lockScreen(
    h('h1', {}, tr('Recover access')),
    h('p', {}, tr('Enter your recovery code and choose a new passphrase.')),
    form,
    h('div', { class: 'lock-links' }, h('button', { class: 'link-btn', type: 'button', onclick: () => showUnlock(vaultFile, { fresh }) }, tr('Back'))),
  );
}

async function forgetAndLogin() {
  const ok = await confirmModal(tr('Forget this device?'), tr('The session and the local encrypted copy are deleted. Your notes on GitHub are not touched.'), tr('Forget'));
  if (!ok) return;
  Auth.forgetDevice();
  noteCache().clear();
  wipe();
  showLogin();
}

// ---------------------------------------------------------------------------
// Locking
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
  document.title = tr('Snowlog');
  if (D.editor) D.editor.destroy();
  Object.assign(D, { id: null, editor: null, dirty: false });
  clearTimeout(D.timer);
  $('drawing').replaceChildren();
  $('drawing').hidden = true;
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
  S.drawText.clear();
  S.indexReady = null;
}

// How long locking waits for a save in progress. GitHub requests have no timeout of their own: a stalled
// connection must not keep the key and the notes in memory past the lock.
const LOCK_SAVE_WAIT = 15000;

async function lock(message = '') {
  if (!S.vault) return;
  if (!message) {
    const id = S.current;
    const text = id ? $('editor').value : null;
    const vault = S.vault;
    const done = await Promise.race([
      saveNow().then(() => true, () => true),
      new Promise((r) => setTimeout(() => r(false), LOCK_SAVE_WAIT)),
    ]);
    // Not saved in time: the text waits, encrypted, in this device's outbox, and goes up after the next unlock.
    if (!done && id && text != null) {
      try {
        await Promise.race([vault.queue(id, text), new Promise((r) => setTimeout(r, 2000))]);
      } catch { /* the lock goes ahead anyway */ }
    }
  }
  if (D.editor) {
    D.editor.destroy();
    Object.assign(D, { id: null, editor: null, dirty: false });
    $('drawing').hidden = true;
  }
  if (S.local) {
    wipe();
    S.local = false;
    showLocalStart();
    return;
  }
  wipe();
  const cached = Auth.cachedVault();
  if (cached) showUnlock(cached, { message });
  else showLogin(message);
}

// The key was rotated on another device: what is pending stays stored here (encrypted) and is uploaded
// after unlocking again with the passphrase.
function keyChanged() {
  lock(errText(new Error('key_changed')));
}

async function logout() {
  if (S.local) {
    const ok = await confirmModal(tr('Forget this folder?'), tr('Snowlog will stop remembering it in this browser. Your files are not touched.'), tr('Forget'), false);
    if (!ok) return;
    await saveNow();
    await forgetHandle();
    wipe();
    S.local = false;
    showLocalStart();
    return;
  }
  const ok = await confirmModal(tr('Sign out?'), tr('Snowlog is locked and this device is forgotten. Your notes on GitHub are not touched.'), tr('Sign out'));
  if (!ok) return;
  await saveNow();
  Auth.forgetDevice();
  await noteCache().clear();
  wipe();
  showLogin(tr('Signed out.'));
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
  S.drawText.clear();
  S.indexReady = null;
  S.calMonth = null;
  updatePlace();
  for (const [action, label] of [['lock', S.local ? 'Close folder' : 'Lock'], ['logout', S.local ? 'Forget this folder' : 'Sign out']]) {
    const b = document.querySelector(`.ribbon [data-action=${action}]`);
    if (b) { b.title = label; b.setAttribute('aria-label', label); }
  }
  renderTree();
  setTimeout(backupReminder, 4000);
  // The full index (for queries and backlinks) loads in the background.
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

// --- Note index (queries, backlinks) ---
function ensureIndex() {
  if (!S.indexReady) {
    const vault = S.vault;
    S.indexReady = (async () => {
      const ids = vault.notes().map((n) => n.id);
      let i = 0;
      S.indexProgress = { done: 0, total: ids.length };
      // Online: what is missing is fetched in blocks of 100 (GraphQL); whatever is left, one by one.
      if (vault.prefetch) await vault.prefetch(ids);
      const worker = async () => {
        while (i < ids.length && S.vault === vault) {
          const id = ids[i++];
          try {
            await vault.read(id);
          } catch (e) {
            // Offline, notes that are not in the cache stay out of the index for now.
            if (!vault.offline && !(e instanceof TypeError)) throw e;
          }
          S.indexProgress.done += 1;
        }
      };
      // What is already in the local cache comes out at once; the rest is fetched from GitHub, 10 at a time.
      await Promise.all(Array.from({ length: 10 }, worker));
      if (S.vault === vault) syncIndex();
    })();
    S.indexReady.catch(() => { S.indexReady = null; });
  }
  return S.indexReady;
}

// Brings the index up to date with what is in the vault and in the decrypted cache.
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
  closeDrawing();
  S.current = null;
  $('note').hidden = true;
  $('empty').hidden = false;
  $('breadcrumb').replaceChildren();
  $('outline').replaceChildren(h('p', { class: 'outline-empty' }, tr('No note open')));
  $('backlinks').replaceChildren();
  setStatus('');
  $('st-words').textContent = '';
  $('st-chars').textContent = '';
  renderTree();
}

// --- Tree ---
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

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

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
        const row = h('div', { class: `tree-row is-file${n.id === D.id ? ' active' : ''}`, role: 'treeitem', tabindex: '0', 'data-file': n.id },
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
  if (!frag.childNodes.length) frag.append(h('p', { class: 'tree-empty' }, tr('No notes yet.')));
  tree.replaceChildren(frag);
  syncIndex();
  renderCalendar();
}

function moreButton() {
  return h('button', { class: 'icon-btn row-more', type: 'button', 'aria-label': tr('Options'), tabindex: '-1', html: icon('more') });
}

// Folders open in the file tree. Online, their names are stored encrypted with the DEK
// (they must not stay in plaintext in the browser); locally they are already in plaintext on disk.
const EXPANDED_KEY = () => (S.local ? 'snowlog.expanded.local' : 'snowlog.expanded.enc');
async function saveExpanded() {
  const list = JSON.stringify([...S.expanded]);
  try {
    if (S.local) localStorage.setItem(EXPANDED_KEY(), list);
    else if (S.dek) localStorage.setItem(EXPANDED_KEY(), await C.encryptText(S.dek, list, 'expanded'));
  } catch { /* no storage */ }
}
async function loadExpanded() {
  S.expanded = new Set();
  try {
    localStorage.removeItem('snowlog.expanded'); // old format, in plaintext
    const raw = localStorage.getItem(EXPANDED_KEY());
    if (!raw) return;
    S.expanded = new Set(JSON.parse(S.local ? raw : await C.decryptText(S.dek, raw, 'expanded')));
  } catch { /* from another key, or damaged: start with everything collapsed */ }
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
    else if (row.dataset.file) {
      if (isSketch(row.dataset.file)) openDrawing(row.dataset.file);
      else openAttachment(row.dataset.file);
    }
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
      ['filePlus', tr('New note'), () => newNote('')],
      ['folderPlus', tr('New folder'), () => newFolder('')],
    ]);
  });

  // Drag notes into folders (or to the root)
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
      ['read', tr('Open'), () => (isSketch(id) ? openDrawing(id) : openAttachment(id))],
      ['import', tr('Insert into the note'), () => insertEmbed(S.vault.index.files[id].path)],
      null,
      ['trash', 'Delete', () => deleteAttachment(id), 'danger'],
    ]);
    return;
  }
  if (row.dataset.note) {
    const id = row.dataset.note;
    openMenu(x, y, [
      ['rename', tr('Rename'), () => renameNotePrompt(id)],
      ['move', tr('Move to…'), () => moveNotePrompt(id)],
      ['bookmark', isBookmarked(id) ? tr('Remove from bookmarks') : tr('Add to bookmarks'), () => toggleBookmark(id)],
      null,
      ['trash', 'Delete', () => deleteNote(id), 'danger'],
    ]);
  } else {
    const path = row.dataset.folder;
    openMenu(x, y, [
      ['filePlus', tr('New note'), () => newNote(path)],
      ['folderPlus', tr('New folder'), () => newFolder(path)],
      ['rename', tr('Rename'), () => renameFolderPrompt(path)],
      null,
      ['trash', 'Delete', () => deleteFolder(path), 'danger'],
    ]);
  }
}

// --- Context menu ---
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
  // Below where it was opened, without covering the button: if it does not fit, with its own scroll.
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

// --- Modals ---
function modal(build) {
  return new Promise((resolve) => {
    const root = $('modal-root');
    const prevFocus = document.activeElement;
    const close = (value) => {
      root.replaceChildren();
      for (const a of ['role', 'aria-modal', 'aria-label']) root.removeAttribute(a);
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
    // A form can't be a dialog itself (its role is form): the dialog is the layer around it.
    if (box.tagName === 'FORM' && box.getAttribute('role') === 'dialog') {
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      if (box.hasAttribute('aria-label')) root.setAttribute('aria-label', box.getAttribute('aria-label'));
      for (const a of ['role', 'aria-modal']) box.removeAttribute(a);
    }
    root.replaceChildren(box);
    root.onclick = (ev) => { if (ev.target === root) close(null); };
    (box.querySelector('input') || box.querySelector('button.primary, button.danger'))?.focus();
  });
}

function promptModal(title, label, value = '', okText = 'OK', hint = '') {
  return modal((close) => {
    const input = h('input', { class: 'input', id: 'mp', value, autocomplete: 'off', spellcheck: 'false' });
    const form = h('form', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('h2', {}, title),
      hint ? h('p', {}, hint) : null,
      h('div', { class: 'field' }, h('label', { for: 'mp' }, label), input),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, tr('Cancel')),
        h('button', { class: 'btn primary', type: 'submit' }, okText)));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      close(input.value);
    });
    setTimeout(() => input.select(), 0);
    return form;
  });
}

function confirmModal(title, text, okText = 'OK', danger = true) {
  return modal((close) => h('div', { class: 'modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
    h('h2', {}, title),
    h('p', {}, text),
    h('div', { class: 'modal-actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, tr('Cancel')),
      h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', onclick: () => close(true) }, okText))))
    .then((v) => v === true);
}

function quickSwitcher() {
  if (!S.vault) return;
  modal((close) => {
    const input = h('input', { class: 'input', placeholder: tr('Find a note or type a new title…'), 'aria-label': tr('Find note'), autocomplete: 'off', spellcheck: 'false' });
    const list = h('div', { class: 'switcher-list', role: 'listbox', 'aria-label': tr('Results') });
    let items = [];
    let sel = 0;
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const notes = S.vault.notes()
        .filter((n) => !q || n.path.toLowerCase().includes(q))
        .sort((a, b) => (q ? baseName(a.path).toLowerCase().indexOf(q) - baseName(b.path).toLowerCase().indexOf(q) : 0) || b.updated.localeCompare(a.updated))
        .slice(0, 50);
      items = notes.map((n) => ({ id: n.id, title: baseName(n.path), sub: parentPath(n.path) }));
      if (q && !S.vault.findByPath(input.value)) items.push({ create: input.value.trim(), title: trf('Create “{name}”', { name: input.value.trim() }), sub: tr('New note') });
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
    return h('div', { class: 'modal switcher', role: 'dialog', 'aria-modal': 'true', 'aria-label': tr('Open note') },
      input, list, h('div', { class: 'switcher-hint' }, tr('↑↓ to move · Enter to open · Esc to close')));
  });
}

// --- Operations ---
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
  const name = await promptModal(tr('New folder'), tr('Name'), '', tr('Create'));
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
  const name = await promptModal(tr('Rename note'), tr('Name'), baseName(note.path), tr('Rename'));
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

// After renaming or moving, rewrites the [[links]] of every note that pointed to what moved.
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
    await S.vault.saveMany(updates, 'update links');
    const mine = updates.find((u) => u.id === S.current);
    if (mine && !S.dirty) {
      $('editor').value = mine.text;
      autosize();
      if (S.mode === 'read') setMode('read');
    }
    syncIndex();
    refreshBacklinks();
    notice(trn(updates.length, 'Links updated in 1 note.', 'Links updated in {n} notes.'));
  } catch (e) {
    notice(trf('The note was renamed, but the links could not be updated: {error}', { error: errText(e) }), 'error');
  }
}

async function moveNotePrompt(id) {
  const note = S.vault.index.notes[id];
  const folder = await promptModal(tr('Move note'), tr('Destination folder'), parentPath(note.path), tr('Move'), tr('Type the folder path, for example “Work/Ideas”. Leave it empty for the root.'));
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
  const ok = await confirmModal(tr('Delete note'), trf('Delete “{name}”? You can recover it from the repository history.', { name: baseName(note.path) }), tr('Delete'));
  if (!ok) return;
  if (id === S.current) {
    clearTimeout(S.saveTimer);
    S.dirty = false;
  }
  const done = await run(() => S.vault.deleteNote(id).then(() => true), 'Note deleted');
  if (!done) return;
  if (id === S.current) showEmpty();
  else renderTree();
}

async function renameFolderPrompt(path) {
  const name = await promptModal(tr('Rename folder'), tr('Name'), baseName(path), tr('Rename'));
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
  const ok = await confirmModal(tr('Delete folder'), count
    ? trn(count, 'Delete “{name}” and its note? You can recover them from the repository history.', 'Delete “{name}” and its {n} notes? You can recover them from the repository history.', { name: baseName(path) })
    : trf('Delete the empty folder “{name}”?', { name: baseName(path) }), tr('Delete'));
  if (!ok) return;
  const inside = S.current && S.vault.index.notes[S.current]?.path.startsWith(`${path}/`);
  if (inside) {
    clearTimeout(S.saveTimer);
    S.dirty = false;
  }
  const done = await run(() => S.vault.deleteFolder(path).then(() => true), 'Folder deleted');
  if (!done) return;
  if (inside) showEmpty();
  else renderTree();
}

// --- Open and edit ---
async function openNote(id, { focusTitle = false } = {}) {
  if (!S.vault.index.notes[id]) return;
  await saveNow();
  await closeDrawing();
  closeMobilePanels();
  S.current = id;
  try { localStorage.setItem('snowlog.last', id); } catch { /* no storage */ }
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
  btn.setAttribute('aria-label', reading ? 'Switch to editing (Ctrl+E)' : 'Switch to reading (Ctrl+E)');
  btn.title = reading ? tr('Edit (Ctrl+E)') : tr('Reading (Ctrl+E)');
  if (!reading) autosize();
}

function autosize() {
  const ed = $('editor');
  ed.style.height = 'auto';
  ed.style.height = `${Math.max(ed.scrollHeight, 200)}px`;
  paintHighlight();
}

// highlight() returns escaped text inside <span class="…"> tags and nothing else: it is turned into nodes here (text
// as text nodes), so the note's text never goes through an HTML parser.
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
function spansToNodes(markup) {
  const root = document.createDocumentFragment();
  const stack = [root];
  for (const m of markup.matchAll(/<span class="([\w -]*)">|<\/span>|[^<]+/g)) {
    const top = stack[stack.length - 1];
    if (m[0] === '</span>') {
      if (stack.length > 1) stack.pop();
    } else if (m[0].startsWith('<span')) {
      const el = document.createElement('span');
      if (m[1]) el.className = m[1];
      top.append(el);
      stack.push(el);
    } else {
      top.append(document.createTextNode(m[0].replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e])));
    }
  }
  return [...root.childNodes];
}

// Highlighting: a <pre> behind the text box with the same text, colored.
// highlight() escapes all the text before adding its <span>s.
let hlFrame = 0;
function paintHighlight() {
  cancelAnimationFrame(hlFrame);
  hlFrame = requestAnimationFrame(() => {
    $('editor-hl').replaceChildren(...spansToNodes(`${Ed.highlight($('editor').value)}\n`));
  });
}

// Applies an editor.js edit, keeping the browser's undo.
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

// --- [[link autocomplete ---
const SG = { q: null, items: [], sel: 0 };

function closeSuggest() {
  SG.q = null;
  $('suggest').hidden = true;
}

function caretBox(pos) {
  const ed = $('editor');
  const mirror = $('editor-mirror');
  // Built from nodes (the text as text): the note is never read as HTML.
  const mark = h('span', { id: 'caret-mark' }, '\u200b');
  mirror.replaceChildren(document.createTextNode(ed.value.slice(0, pos)), mark);
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
    ? [h('span', { class: 'suggest-name' }, trf('Create “{name}”', { name: it.name }))]
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
  // If the name is unique it is enough; otherwise the link uses the path.
  const target = it.create ? it.name : (S.vault.notes().filter((n) => baseName(n.path).toLowerCase() === it.name.toLowerCase()).length > 1 ? it.path : it.name);
  applyEdit(Ed.completeLink(ed.value, pos, q, target));
  if (exists) return;
  try {
    await S.vault.createNote(normalizePath(it.name), '');
    renderTree();
    syncIndex();
    notice(trf('Note “{name}” created.', { name: baseName(it.name) }));
  } catch (e) {
    notice(trf('The note could not be created: {error}', { error: errText(e) }), 'error');
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
  $('st-words').textContent = trf('{n} words', { n: wordCount(text).toLocaleString(LANG) });
  $('st-chars').textContent = trf('{n} characters', { n: text.length.toLocaleString(LANG) });
  const heads = outline(text);
  $('outline').replaceChildren(...(heads.length
    ? heads.map((hd, i) => {
      const b = h('button', { class: 'outline-item', type: 'button', title: hd.text, onclick: () => jumpTo(hd, i) }, hd.text);
      b.style.setProperty('--level', hd.level - 1);
      return b;
    })
    : [h('p', { class: 'outline-empty' }, tr('No headings'))]));
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

// Where the notes are, and when offline, how many changes are waiting to be uploaded.
function updatePlace() {
  const el = $('st-place');
  if (!S.vault) return;
  if (S.local) {
    el.textContent = S.vault.kind === 'folder' ? trf('Folder “{name}”', { name: S.vault.label }) : tr('In this browser');
    el.className = '';
    return;
  }
  const n = S.vault.outbox.size;
  el.textContent = S.vault.offline
    ? (n ? trn(n, 'Offline · 1 change to upload', 'Offline · {n} changes to upload') : tr('Offline'))
    : (n ? trn(n, 'Uploading 1 change…', 'Uploading {n} changes…') : tr('GitHub · encrypted'));
  el.className = S.vault.offline ? 'offline' : '';
}

// A folder on the computer: check whether something changed outside (another editor, OneDrive, Dropbox…).
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
        // It was deleted or moved outside while typing: what was written is not lost.
        const path = vault.freePath('', 'Recovered');
        const id = await vault.createNote(path, text);
        S.dirty = false;
        notice(trf('The note was deleted or moved outside Snowlog. What you were writing is in “{path}”.', { path }), 'error');
        await openNote(id);
      } else {
        notice(tr('The note you had open was deleted or moved outside Snowlog.'));
        showEmpty();
      }
    } else if (cur && res.changed.includes(cur) && !S.dirty) {
      const text = await vault.read(cur);
      if (S.current === cur && !S.dirty) {
        $('editor').value = text;
        autosize();
        if (S.mode === 'read') setMode('read');
        refreshSide();
        notice(tr('The note changed outside Snowlog and was updated.'));
      }
    }
    renderTree();
    syncIndex();
    S.indexReady = null;
    ensureIndex().catch(() => {});
  } catch { /* the folder may be unreachable for a moment */ } finally {
    rescanning = false;
  }
}

// When the network is back: reloads the index and uploads what was written offline.
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
      if (res.synced) notice(trn(res.synced, 'Back online: 1 change uploaded.', 'Back online: {n} changes uploaded.'));
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
      if (e.message === 'key_changed') keyChanged();
      else if (e.message !== 'offline') notice(trf('Could not sync: {error}', { error: errText(e) }), 'error');
    } finally {
      syncing = null;
      updatePlace();
    }
  })();
  return syncing;
}

// On save, the changes here were combined with another device's: the editor now shows the result
// (and if typing went on in the meantime, that is combined too).
function applyMerged(id, sent, merged) {
  if (S.current !== id) return;
  const ed = $('editor');
  const now = ed.value;
  let next = merged;
  if (now !== sent) {
    const m = merge3(sent, now, merged);
    if (m.conflict) return; // what is being typed clashes: it will be resolved on save
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
  notice(tr('Your changes were combined with the ones made elsewhere.'));
}

function reportConflict(conflict) {
  if (S.vault?.index.notes[conflict.id]) expandTo(conflict.path);
  renderTree();
  const n = h('div', { class: 'notice' },
    tr('This note was also changed on another device. Your version was saved and the other one is in '),
    h('button', { class: 'link-btn', type: 'button', onclick: () => { n.remove(); openNote(conflict.id); } }, `“${baseName(conflict.path)}”`),
    '.');
  $('notices').append(n);
  setTimeout(() => n.remove(), 20000);
}

function setStatus(kind) {
  const el = $('st-sync');
  const text = {
    loading: 'Decrypting…', queued: 'Saved here (offline)', pending: 'Not saved', saving: 'Encrypting and saving…', saved: 'Saved', error: 'Save failed', '': '',
  }[kind];
  el.textContent = text ? tr(text) : '';
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
  if (D.dirty) saveDrawing();
  clearTimeout(S.saveTimer);
  S.dirtySince = 0;
  if (!S.dirty || !S.current || !S.vault) return Promise.all([S.saving, D.saving]);
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
      if (e?.message === 'key_changed') {
        S.dirty = false;
        keyChanged();
        return;
      }
      notice(trf('Could not save: {error}', { error: errText(e) }), 'error');
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

// --- Rich reading: cssclasses, tickable tasks and queries ---
function applyCssClasses(view, text) {
  view.className = 'reading markdown';
  const fm = (text.match(/^---\n[\s\S]*?\n---/) && parseNote({ id: '', path: 'x', text }).fm) || {};
  const raw = fm.cssclasses ?? fm.cssclass ?? [];
  for (const c of (Array.isArray(raw) ? raw : String(raw).split(/[\s,]+/))) {
    const name = String(c).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (name) view.classList.add(`cs-${name}`);
  }
}

// The note's own checkboxes match, in order, the task lines of the text.
function enableOwnTasks(view, text) {
  const boxes = [...view.querySelectorAll('li.task > input[type=checkbox]')];
  const lines = contentLines(text).filter((l) => TASK_LINE_RE.test(l.value));
  if (boxes.length !== lines.length) return;
  boxes.forEach((box, i) => {
    box.disabled = false;
    box.classList.add('task-checkbox');
    box.dataset.line = String(lines[i].line);
    box.setAttribute('aria-label', 'Toggle task');
  });
}

async function runQueries() {
  const view = $('reading');
  const blocks = [...view.querySelectorAll('pre > code.language-dataview, pre > code.language-query')];
  if (!blocks.length) return;
  const id = S.current;
  const placeholders = blocks.map((code) => {
    const box = h('div', { class: 'query', 'data-source': code.textContent }, h('p', { class: 'query-empty' }, tr('Loading…')));
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
      box.replaceChildren(h('p', { class: 'query-error' }, trf('Query: {error}', { error: e.message })));
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
      if (text == null) throw new Error('The task has changed; reload the note.');
      $('editor').value = text;
      autosize();
      S.dirty = true;
      await saveNow();
      syncIndex();
      if (box.dataset.note) setMode('read');
    } else {
      const text = toggleTaskLine(await S.vault.read(target), line, done);
      if (text == null) throw new Error('The task has changed; reload the note.');
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

// --- Backlinks ---
function refreshBacklinks() {
  const el = $('backlinks');
  // With a drawing open: the notes that embed or link it.
  const file = !S.current && D.id ? S.vault?.index.files?.[D.id] : null;
  const me = S.current ? S.notesIdx.get(S.current) : file && { id: D.id, name: baseName(file.path), path: file.path };
  if (!S.current && !file) {
    el.replaceChildren();
    return;
  }
  if (!S.indexReady || !me) {
    el.replaceChildren(h('p', { class: 'outline-empty' }, tr('Searching…')));
    return;
  }
  const from = indexedNotes().filter((n) => n.id !== me.id && linksTo(n, me));
  el.replaceChildren(...(from.length
    ? from.sort((a, b) => a.name.localeCompare(b.name, 'en')).map((n) => h('button', {
      class: 'outline-item', type: 'button', title: n.path, onclick: () => openNote(n.id),
    }, n.name))
    : [h('p', { class: 'outline-empty' }, tr('No notes link here'))]));
}

// --- Calendar ---
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
  const offset = (first.getDay() + 6) % 7; // week from Monday to Sunday
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
      title: `${formatDate(date, 'dddd, MMMM D')}${days.has(iso) ? ' · has a note' : ''}`,
      'aria-label': `${formatDate(date, 'dddd, MMMM D, YYYY')}${days.has(iso) ? ', has a note' : ''}`,
      onclick: () => openDaily(date),
    }, String(d)));
  }
  const move = (delta) => {
    S.calMonth = new Date(y, m + delta, 1);
    renderCalendar();
  };
  el.replaceChildren(
    h('div', { class: 'cal-head' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': tr('Previous month'), html: icon('chevronLeft'), onclick: () => move(-1) }),
      h('button', { class: 'cal-title', type: 'button', title: tr('Go to today'), onclick: () => { S.calMonth = null; renderCalendar(); } },
        formatDate(first, 'MMMM YYYY')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': tr('Next month'), html: icon('chevron'), onclick: () => move(1) })),
    h('div', { class: 'cal-grid', role: 'group', 'aria-label': formatDate(first, 'MMMM YYYY') },
      ...['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => h('span', { class: 'cal-dow', 'aria-hidden': 'true' }, d)),
      ...cells),
  );
}

// --- Daily note and templates ---
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
  notice(tr('You have no dashboard yet. Use “Set up my space” in the ⋯ menu.'));
  return undefined;
}

function templateNotes() {
  const f = WS.templatesFolder;
  return S.vault.notes().filter((n) => f && n.path.startsWith(`${f}/`)).sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

function pickModal(title, items) {
  return modal((close) => h('div', { class: 'modal switcher', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('h2', { class: 'pick-title' }, title),
    h('div', { class: 'switcher-list', role: 'listbox', 'aria-label': tr('Results') }, ...items.map((it) => h('button', {
      class: 'switcher-item', type: 'button', role: 'option', onclick: () => close(it.value),
    }, h('span', {}, it.label), it.sub ? h('span', { class: 'sub' }, it.sub) : null)))));
}

async function chooseTemplate(title) {
  const list = templateNotes();
  if (!list.length) {
    notice(trf('There are no templates in “{folder}”. Use “Set up my space” in the ⋯ menu.', { folder: WS.templatesFolder }));
    return null;
  }
  const prefix = `${WS.templatesFolder}/`;
  return pickModal(title, list.map((n) => ({ label: n.path.slice(prefix.length), value: n })));
}

async function insertTemplate() {
  if (!S.current) return;
  const t = await chooseTemplate(tr('Insert template'));
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
  const t = await chooseTemplate(tr('New note from template'));
  if (!t) return;
  const name = await promptModal(tr('New note'), tr('Title (you can write Folder/Title)'), '', tr('Create'));
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
    notice(tr('Your space is already set up.'));
    return;
  }
  const ok = await confirmModal(tr('Set up my space'),
    trf('This creates the “{home}” dashboard, the folders {folders} and {n} templates and notes. Nothing you already have is touched.', { home: WS.home, folders: space.folders.map((f) => `“${f}”`).join(', '), n: missing.length }),
    tr('Set up'), false);
  if (!ok) return;
  await saveNow();
  const done = await run(() => S.vault.importNotes(missing, { message: 'set up my space', folders }));
  if (!done) return;
  for (const f of [WS.templatesFolder, WS.dailyFolder]) if (f) S.expanded.add(f);
  renderTree();
  notice(tr('Space ready: dashboard, daily notes, projects, templates and archive.'));
  await openDaily();
}

async function loadExamples() {
  const space = exampleSpace({ dailyFolder: WS.dailyFolder || '' });
  const missing = space.notes.filter((n) => !S.vault.findByPath(n.path));
  if (!missing.length) {
    notice(tr('The example project is already loaded.'));
    return;
  }
  const skipped = space.notes.length - missing.length;
  const ok = await confirmModal(tr('Load examples'),
    trf(skipped
      ? 'This creates “{root}” with a project, 4 stories, a board, a meeting, a knowledge pill and daily notes for today and the two days before, all linked together. {n} notes you already have are kept (for example, today\'s). You can delete it whenever you want.'
      : 'This creates “{root}” with a project, 4 stories, a board, a meeting, a knowledge pill and daily notes for today and the two days before, all linked together. You can delete it whenever you want.', { root: space.root, n: skipped }),
    tr('Load'), false);
  if (!ok) return;
  await saveNow();
  const done = await run(() => S.vault.importNotes(missing, { message: 'load examples', folders: space.folders }));
  if (!done) return;
  for (const f of space.folders) S.expanded.add(f);
  expandTo(`${space.root}/x`);
  renderTree();
  notice(tr('Examples loaded. Start with “How to use this example”.'));
  const guide = S.vault.findByPath(`${space.root}/How to use this example`);
  if (guide) {
    S.mode = 'read';
    await openNote(guide.id);
  }
}

// --- Import folder ---
async function importFolder(files) {
  const plan = planImport(files);
  const skippedTotal = plan.skipped.config + plan.skipped.other + plan.skipped.tooBig;
  if (!plan.notes.length) {
    notice(tr('There are no Markdown notes (.md) in that folder.'), 'error');
    return;
  }
  const bytes = plan.notes.reduce((acc, n) => acc + n.file.size, 0);
  const parts = [];
  if (plan.skipped.other) parts.push(`${plan.skipped.other} images or other files`);
  if (plan.skipped.config) parts.push(`${plan.skipped.config} settings files (.obsidian, .git…)`);
  if (plan.skipped.tooBig) parts.push(`${plan.skipped.tooBig} notes over 2 MB`);
  const folder = await promptModal(
    trn(plan.notes.length, 'Import 1 note ({size})', 'Import {n} notes ({size})', { size: formatBytes(bytes) }),
    tr('Destination folder in Snowlog (empty = root)'),
    plan.root,
    tr('Import'),
    skippedTotal ? trf('They are encrypted on this device before upload. Skipped: {list}. If a name already exists, “(imported)” is added.', { list: parts.join(', ') }) : tr('They are encrypted on this device before upload. If a name already exists, “(imported)” is added.'),
  );
  if (folder == null) return;
  await saveNow();
  const target = normalizePath(folder);
  setStatus('');
  const st = $('st-sync');
  try {
    st.textContent = tr('Reading files…');
    const items = await Promise.all(plan.notes.map(async (n) => ({
      path: target ? `${target}/${n.path}` : n.path,
      text: await n.file.text(),
    })));
    st.textContent = trf('Encrypting and importing {d}/{t}…', { d: 0, t: items.length });
    const result = await S.vault.importNotes(items, {
      onProgress: (done, total) => {
        S.lastActivity = Date.now();
        st.textContent = trf('Encrypting and importing {d}/{t}…', { d: done, t: total });
      },
    });
    if (target) S.expanded.add(target);
    renderTree();
    st.textContent = '';
    notice(trf(target ? 'Imported {n} notes into “{target}”.' : 'Imported {n} notes.', { n: result.length, target }));
    if (!S.current && result[0]) openNote(result[0].id);
  } catch (e) {
    renderTree();
    st.textContent = '';
    notice(trf('The import stopped: {error}. What was already imported is kept.', { error: errText(e) }), 'error');
  }
}

// --- Panels ---
// --- Kanban boards (Markdown with ## columns and - [ ] cards) ---
// Every change on the board rewrites the note text and is saved like any edit.
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
      const box = h('input', { type: 'checkbox', class: 'kanban-check', 'aria-label': tr('Done'), checked: c.done });
      box.addEventListener('change', () => setBoard(K.toggleCard(board, li, ci)));
      const textEl = h('div', { class: 'kanban-text', html: inline(c.text) });
      const card = h('div', { class: `kanban-card${c.done ? ' done' : ''}`, role: 'listitem', draggable: 'true' },
        box, textEl,
        h('div', { class: 'kanban-card-actions' },
          li > 0 ? h('button', { class: 'icon-btn', type: 'button', title: tr('To the previous column'), 'aria-label': tr('To the previous column'), onclick: () => setBoard(K.moveCard(board, { lane: li, index: ci }, { lane: li - 1, index: 1e9 })) }, '‹') : null,
          li < board.lanes.length - 1 ? h('button', { class: 'icon-btn', type: 'button', title: tr('To the next column'), 'aria-label': tr('To the next column'), onclick: () => setBoard(K.moveCard(board, { lane: li, index: ci }, { lane: li + 1, index: 1e9 })) }, '›') : null,
          h('button', { class: 'icon-btn', type: 'button', title: tr('Edit'), 'aria-label': tr('Edit card'), onclick: async () => {
            const t = await promptModal(tr('Edit card'), tr('Text'), c.text, tr('Save'));
            if (t != null && t.trim()) setBoard(K.editCard(board, li, ci, t));
          } }, '✎'),
          h('button', { class: 'icon-btn', type: 'button', title: tr('Delete'), 'aria-label': tr('Delete card'), onclick: () => setBoard(K.deleteCard(board, li, ci)) }, '×')));
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
    const add = h('input', { class: 'input kanban-add', placeholder: tr('+ Add card'), 'aria-label': trf('Add a card to {lane}', { lane: lane.title }) });
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
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': trf('{lane} options', { lane: lane.title }), html: icon('more'), onclick: (ev) => {
          const r = ev.currentTarget.getBoundingClientRect();
          openMenu(r.left, r.bottom, [
            ['rename', tr('Rename column'), async () => {
              const t = await promptModal(tr('Rename column'), tr('Name'), lane.title, tr('Rename'));
              if (t != null && t.trim()) setBoard(K.renameLane(board, li, t));
            }],
            li > 0 && ['chevronLeft', tr('Move left'), () => setBoard(K.moveLane(board, li, li - 1))],
            li < board.lanes.length - 1 && ['chevron', tr('Move right'), () => setBoard(K.moveLane(board, li, li + 1))],
            null,
            ['trash', 'Delete column', async () => {
              if (lane.cards.length && !(await confirmModal(tr('Delete column'), trn(lane.cards.length, 'Its card will be deleted too.', 'Its {n} cards will be deleted too.'), tr('Delete')))) return;
              setBoard(K.deleteLane(board, li));
            }, 'danger'],
          ].filter((x) => x !== false));
        } })),
      cardsEl, add);
  });
  const newLane = h('button', { class: 'kanban-new-lane', type: 'button', onclick: async () => {
    const t = await promptModal(tr('New column'), tr('Name'), '', tr('Create'));
    if (t != null && t.trim()) setBoard(K.addLane(board, t));
  } }, tr('+ Column'));
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
  const path = S.vault.freePath(currentFolder(), 'Board');
  const id = await run(() => S.vault.createNote(path, K.NEW_BOARD));
  if (!id) return;
  expandTo(path);
  S.mode = 'read';
  await openNote(id);
}

// --- Graph view ---
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

async function graphView(focusId = null) {
  if (!S.vault) return;
  await saveNow();
  modal((close) => {
    const canvas = h('canvas', { class: 'graph-canvas', 'aria-label': tr('Note graph') });
    const info = h('span', { class: 'graph-info' }, tr('Preparing…'));
    const localBox = h('input', { type: 'checkbox', id: 'graph-local', checked: !!focusId });
    const depthSel = h('select', { class: 'input graph-depth', 'aria-label': tr('Hops') }, ...[1, 2, 3].map((d) => h('option', { value: String(d) }, trn(d, '1 hop', '{n} hops'))));
    const orphans = h('input', { type: 'checkbox', id: 'graph-orphans', checked: true });
    const box = h('div', { class: 'modal graph', role: 'dialog', 'aria-modal': 'true', 'aria-label': tr('Graph view') },
      h('div', { class: 'graph-bar' },
        h('h2', {}, tr('Graph')),
        S.current ? h('label', { class: 'check', for: 'graph-local' }, localBox, tr('Only this note')) : null,
        S.current ? depthSel : null,
        h('label', { class: 'check', for: 'graph-orphans' }, orphans, tr('Notes without links')),
        info,
        h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, tr('Close'))),
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
    // Fits the graph on screen once it settles (unless the person has moved it).
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
      info.textContent = `${trn(g.nodes.length, '1 note', '{n} notes')} · ${trn(g.links.length, '1 link', '{n} links')}`;
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
    // Everything stops when the dialog closes (or on lock, which empties the dialogs).
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

// --- Bookmarks (note paths, in the vault settings: shared between devices) ---
const bookmarks = () => (Array.isArray(WS.bookmarks) ? WS.bookmarks : []);
const isBookmarked = (id) => !!S.vault?.index.notes[id] && bookmarks().includes(S.vault.index.notes[id].path);

async function setBookmarks(list) {
  try {
    await S.vault.saveSettings({ ...S.vault.getSettings(), bookmarks: list });
  } catch (e) {
    notice(trf('The bookmarks could not be saved: {error}', { error: errText(e) }), 'error');
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
    notice(trf(on ? '“{name}” added to bookmarks.' : '“{name}” removed from bookmarks.', { name: baseName(path) }));
  }
}

// On rename or move, bookmarks follow their notes.
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
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': trf('Remove “{name}” from bookmarks', { name: baseName(path) }), title: tr('Remove'), onclick: () => setBookmarks(bookmarks().filter((x) => x !== path)) }, '×')))
    : [h('p', { class: 'search-empty' }, tr('No bookmarks. Use “Add to bookmarks” in a note\'s ⋯ menu.'))]));
}

// --- Command palette (Ctrl+P) ---
function commands() {
  const cur = S.current && S.vault?.index.notes[S.current] ? S.current : null;
  const list = [
    ['open', tr('Open note'), 'Ctrl+O', () => quickSwitcher()],
    ['search', tr('Search all notes'), 'Ctrl+Shift+F', () => openSearch()],
    ['new', tr('New note'), 'Ctrl+N', () => newNote()],
    ['new-tpl', tr('New note from template'), '', () => newFromTemplate()],
    ['today', tr('Today\'s note'), 'Ctrl+D', () => openDaily()],
    ['home', tr('Dashboard'), '', () => openHome()],
    ['mode', tr('Switch between editing and reading'), 'Ctrl+E', () => ACTIONS['toggle-mode']()],
    ['save', tr('Save now'), 'Ctrl+S', () => saveNow()],
    cur && ['tpl', tr('Insert template'), '', () => insertTemplate()],
    cur && ['attach', tr('Attach an image or PDF'), '', () => $('attach-input').click()],
    cur && ['bookmark', isBookmarked(cur) ? tr('Remove from bookmarks') : tr('Add to bookmarks'), '', () => toggleBookmark(cur)],
    cur && ['rename', tr('Rename note'), '', () => renameNotePrompt(cur)],
    cur && ['move', tr('Move note'), '', () => moveNotePrompt(cur)],
    cur && ['history', tr('Version history'), '', () => historyModal(cur)],
    cur && ['delete', tr('Delete note'), '', () => deleteNote(cur)],
    ['graph', tr('Graph view'), 'Ctrl+G', () => graphView()],
    ['help', tr('Help and keyboard shortcuts'), '?', () => helpModal()],
    cur && ['graph-local', tr('Graph of this note'), '', () => graphView(cur)],
    ['board', tr('New Kanban board'), '', () => newBoard()],
    ['drawing', tr('New drawing'), '', () => newDrawing()],
    ...Object.keys(SKETCH_TEMPLATES).map((t) => ['drawing', trf('New drawing from a template: {name}', { name: sketchTemplate(t, LANG).name }), '', () => newDrawing({ template: t })]),
    cur && ['drawing-in', tr('Insert a new drawing into the note'), '', () => newDrawing({ insert: true })],
    ['files', tr('Show files'), '', () => showLeftPane('files')],
    ['tags', tr('Show tags'), '', () => showLeftPane('tags')],
    ['bookmarks', tr('Show bookmarks'), '', () => showLeftPane('bookmarks')],
    ['left', tr('Show or hide the left panel'), '', () => togglePanel('left')],
    ['right', tr('Show or hide the right panel'), '', () => togglePanel('right')],
    ['collapse', tr('Collapse all folders'), '', () => ACTIONS['collapse-all']()],
    ['settings', tr('Settings'), '', () => settingsModal()],
    ['theme-light', tr('Light theme'), '', () => { try { localStorage.setItem('snowlog.theme', 'light'); } catch { /* */ } applyTheme('light'); }],
    ['theme-dark', tr('Dark theme'), '', () => { try { localStorage.setItem('snowlog.theme', 'dark'); } catch { /* */ } applyTheme('dark'); }],
    ['theme-auto', tr('Automatic theme'), '', () => { try { localStorage.setItem('snowlog.theme', 'auto'); } catch { /* */ } applyTheme('auto'); }],
    ['setup', tr('Set up my space'), '', () => setupSpace()],
    ['examples', tr('Load examples'), '', () => loadExamples()],
    ['import', tr('Import a Markdown folder'), '', () => ACTIONS.import()],
    ['backup', S.local ? tr('Backup (.zip)') : tr('Encrypted backup'), '', () => backupNow()],
    ['restore', tr('Import a backup (.snowlog or .zip)'), '', () => $('backup-input').click()],
    !S.local && ['export', tr('Export unencrypted (.zip)'), '', () => exportZip()],
    !S.local && ['security', tr('Passphrase and recovery'), '', () => securityModal()],
    ['lock', S.local ? tr('Close folder') : tr('Lock'), '', () => lock()],
  ];
  return list.filter(Boolean).map(([id, label, keys, run]) => ({ id, label, keys, run }));
}

function recentCommands() {
  try { return JSON.parse(localStorage.getItem('snowlog.recentCommands') || '[]'); } catch { return []; }
}

// --- Help: a short guide and every keyboard shortcut (from the palette, or with "?") ---
const HELP_GUIDE = [
  'Your notes are encrypted on this device before they go to GitHub: the repository only holds files nobody can read without your passphrase or your recovery code.',
  'Keep the recovery code somewhere safe: it is the only way back in if you forget the passphrase. Nobody, not even Snowlog, can recover your notes without one of them.',
  'Notes save themselves while you write. Offline, they are kept on this device and go up when the network is back.',
  'Link notes with [[Another note]]; tags are #words; a line starting with - [ ] is a task. Queries, Kanban boards and drawings live in notes too.',
  'Make an encrypted backup from time to time (palette → Encrypted backup): it opens with your passphrase or your recovery code.',
  'On a Mac, use Cmd where it says Ctrl.',
];
const HELP_KEYS = [
  ['Notes', [
    ['Open a note', ['Ctrl', 'O']], ['Search all notes', ['Ctrl', 'Shift', 'F']], ['New note', ['Ctrl', 'N']],
    ['Today\'s note', ['Ctrl', 'D']], ['Switch between editing and reading', ['Ctrl', 'E']], ['Save now', ['Ctrl', 'S']],
    ['Command palette', ['Ctrl', 'P']], ['Graph view', ['Ctrl', 'G']], ['This help', ['?']],
  ]],
  ['Writing', [
    ['Bold', ['Ctrl', 'B']], ['Italic', ['Ctrl', 'I']], ['Link', ['Ctrl', 'K']], ['Tick or untick a task', ['Ctrl', 'Enter']],
    ['Continue a list', ['Enter']], ['Indent or outdent', ['Tab'], ['Shift', 'Tab']], ['Pick a suggestion ([[ or #)', ['Enter'], ['Tab']],
  ]],
  ['Lists and dialogs', [['Move through results', ['↑'], ['↓']], ['Open the selected one', ['Enter']], ['Close', ['Esc']]]],
];

function helpModal() {
  return modal((close) => {
    const keys = (combos) => combos.flatMap((combo, i) => [
      ...(i ? [' / '] : []),
      ...combo.flatMap((k, j) => [...(j ? ['+'] : []), h('kbd', {}, tr(k))]),
    ]);
    const box = h('div', { class: 'modal help-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': tr('Help') },
      h('h2', {}, tr('Help')),
      h('ul', { class: 'help-guide' }, ...HELP_GUIDE.map((t) => h('li', {}, tr(t)))),
      h('h3', {}, tr('Keyboard shortcuts')),
      ...HELP_KEYS.map(([title, rows]) => h('table', { class: 'help-keys' },
        h('caption', {}, tr(title)),
        h('tbody', {}, ...rows.map(([what, ...combos]) => h('tr', {}, h('td', {}, tr(what)), h('td', {}, ...keys(combos))))))),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close(null) }, tr('Close'))));
    return box;
  });
}

function commandPalette() {
  if (!S.vault) return;
  const all = commands();
  const recent = recentCommands();
  modal((close) => {
    const input = h('input', { class: 'input', placeholder: tr('Type a command…'), 'aria-label': tr('Find command'), autocomplete: 'off', spellcheck: 'false' });
    const list = h('div', { class: 'switcher-list', role: 'listbox', 'aria-label': tr('Results') });
    let items = [];
    let sel = 0;
    const draw = () => {
      const words = fold(input.value.trim()).split(/\s+/).filter(Boolean);
      items = all.filter((c) => words.every((w) => fold(c.label).includes(w)));
      if (!words.length) items.sort((a, b) => (recent.indexOf(a.id) + 1 || 99) - (recent.indexOf(b.id) + 1 || 99));
      sel = Math.min(sel, Math.max(0, items.length - 1));
      list.replaceChildren(...(items.length ? items.map((c, i) => h('button', {
        class: `switcher-item command-item${i === sel ? ' sel' : ''}`, type: 'button', role: 'option', 'aria-selected': String(i === sel), onclick: () => pick(i),
      }, h('span', {}, c.label), c.keys ? h('kbd', {}, c.keys) : null)) : [h('p', { class: 'search-empty' }, tr('No command matches.'))]));
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
    return h('div', { class: 'modal switcher', role: 'dialog', 'aria-modal': 'true', 'aria-label': tr('Command palette') },
      input, list, h('div', { class: 'switcher-hint' }, tr('↑↓ to move · Enter to run · Esc to close')));
  });
}

// --- Preview when hovering over a [[link]] ---
let previewTimer = null;
function hidePreview() {
  clearTimeout(previewTimer);
  $('hover-preview').hidden = true;
  $('hover-preview').replaceChildren();
}

function setupHoverPreview() {
  const box = $('hover-preview');
  if (!matchMedia('(hover: hover)').matches) return; // not on touch screens
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

// --- Settings ---
async function settingsModal() {
  if (!S.vault) return;
  const cur = { ...WS };
  const folders = [...S.vault.index.folders].sort((a, b) => collator.compare(a, b));
  const notes = S.vault.notes().map((n) => n.path).sort((a, b) => collator.compare(a, b));
  const dl = (id, items) => h('datalist', { id }, ...items.map((v) => h('option', { value: v })));
  const text = (id, label, value, list, hint) => {
    const input = h('input', { class: 'input', id, value: value ?? '', list, autocomplete: 'off', spellcheck: 'false' });
    return [h('div', { class: 'field' }, h('label', { for: id }, tr(label)), input, hint ? h('small', { class: 'field-hint' }, tr(hint)) : null), input];
  };
  const num = (id, label, value, min, max, hint) => {
    const input = h('input', { class: 'input', id, type: 'number', min: String(min), max: String(max), value: String(value ?? '') });
    return [h('div', { class: 'field' }, h('label', { for: id }, tr(label)), input, hint ? h('small', { class: 'field-hint' }, tr(hint)) : null), input];
  };
  let theme = 'auto';
  let lang = 'auto';
  try { lang = localStorage.getItem('snowlog.lang') || 'auto'; } catch { /* no storage */ }
  try { theme = localStorage.getItem('snowlog.theme') || 'auto'; } catch { /* no storage */ }
  const result = await modal((close) => {
    const [fHome, iHome] = text('st-home', 'Dashboard (note)', cur.home, 'dl-notes');
    const [fDaily, iDaily] = text('st-daily', 'Daily notes folder', cur.dailyFolder, 'dl-folders', 'Daily notes are named YYYY-MM-DD.');
    const [fTpl, iTpl] = text('st-tpl', 'Daily note template', cur.dailyTemplate, 'dl-notes');
    const [fTpls, iTpls] = text('st-tpls', 'Templates folder', cur.templatesFolder, 'dl-folders', 'What is here does not show up in queries.');
    const [fAtt, iAtt] = text('st-att', 'Attachments folder', cur.attachmentsFolder, 'dl-folders');
    const openDaily = h('input', { type: 'checkbox', id: 'st-open', checked: !!cur.openDailyOnStart });
    const [fLock, iLock] = num('st-lock', 'Lock after this many minutes unused', cur.lockAfterMinutes, 1, 240);
    const [fBk, iBk] = num('st-bk', 'Backup reminder every (days)', cur.backupReminderDays, 0, 365, '0 = no reminder.');
    const themeSel = h('select', { class: 'input', id: 'st-theme' },
      ...[['auto', 'Automatic (the system\'s)'], ['light', 'Light'], ['dark', 'Dark']]
        .map(([v, l]) => h('option', { value: v, selected: v === theme }, tr(l))));
    themeSel.addEventListener('change', () => applyTheme(themeSel.value));
    const langSel = h('select', { class: 'input', id: 'st-lang' },
      h('option', { value: 'auto', selected: lang === 'auto' }, tr('Automatic (the browser\'s)')),
      ...LANGS.map((l) => h('option', { value: l, selected: l === lang, lang: l }, LANG_NAMES[l])));
    const err = errorLine();
    const btn = h('button', { class: 'btn primary', type: 'submit' }, tr('Save'));
    const form = h('form', { class: 'modal settings', role: 'dialog', 'aria-modal': 'true', 'aria-label': tr('Settings') },
      h('h2', {}, tr('Settings')),
      dl('dl-folders', folders), dl('dl-notes', notes),
      h('h3', {}, tr('Day to day')), fHome, fDaily, fTpl,
      h('label', { class: 'check', for: 'st-open' }, openDaily, tr('Open today\'s note on start')),
      h('h3', {}, tr('Folders')), fTpls, fAtt,
      h('h3', {}, tr('Security and backups')), S.local ? null : fLock, fBk,
      h('h3', {}, tr('This device')), h('div', { class: 'field' }, h('label', { for: 'st-theme' }, tr('Theme')), themeSel),
      h('div', { class: 'field' }, h('label', { for: 'st-lang' }, tr('Language')), langSel),
      h('p', { class: 'field-hint' }, S.local ? tr('Settings are stored in the folder (.snowlog/settings.json).') : tr('Settings are stored encrypted in your vault and apply on all your devices. The theme and the language are for this device only.')),
      err,
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => { applyTheme(theme); close(null); } }, tr('Cancel')),
        btn));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const clean = (v) => normalizePath(v || '');
      const lockMin = Math.round(Number(iLock.value));
      const bkDays = Math.round(Number(iBk.value));
      if (!S.local && !(lockMin >= 1 && lockMin <= 240)) return showError(err, tr('The lock must be between 1 and 240 minutes.'));
      if (!(bkDays >= 0 && bkDays <= 365)) return showError(err, tr('The reminder must be between 0 and 365 days.'));
      close({
        theme: themeSel.value,
        lang: langSel.value,
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
  try { localStorage.setItem('snowlog.theme', result.theme); } catch { /* no storage */ }
  applyTheme(result.theme);
  // The language is chosen when the page starts: after saving, it opens again in the new one.
  let langChanged = false;
  if (result.lang !== lang) {
    try { localStorage.setItem('snowlog.lang', result.lang); langChanged = true; } catch { /* no storage */ }
  }
  // Only what differs from the defaults is stored.
  const changed = Object.fromEntries(Object.entries(result.settings).filter(([k, v]) => v !== DEFAULTS[k]));
  const before = JSON.stringify(S.vault.getSettings());
  if (JSON.stringify(changed) !== before) {
    try {
      await S.vault.saveSettings(changed);
    } catch (e) {
      notice(trf('The settings could not be saved: {error}', { error: errText(e) }), 'error');
      return;
    }
  }
  applySettings();
  renderCalendar();
  notice(tr('Settings saved.'));
  // Changing it now would mean reloading, which locks the vault: it is used from the next start.
  if (langChanged) notice(tr('The new language is used the next time Snowlog opens.'));
}

// --- Passphrase and recovery code ---
async function securityModal() {
  if (S.local || !S.vaultFile) return;
  const choice = await modal((close) => h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': tr('Passphrase and recovery') },
    h('h2', {}, tr('Passphrase and recovery')),
    h('p', {}, tr('The key that encrypts your notes does not change: only how it is opened. Nothing needs re-encrypting.')),
    h('div', { class: 'security-options' },
      h('button', { class: 'btn', type: 'button', onclick: () => close('pass') }, tr('Change the passphrase')),
      h('button', { class: 'btn', type: 'button', onclick: () => close('recovery') }, tr('Generate a new recovery code')),
      h('button', { class: 'btn', type: 'button', onclick: () => close('rotate') }, tr('Change the encryption key (re-encrypt everything)'))),
    h('div', { class: 'modal-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, tr('Close')))));
  if (choice === 'pass') changePassphraseModal();
  else if (choice === 'recovery') renewRecoveryModal();
  else if (choice === 'rotate') rotateKeyModal();
}

function showNewRecoveryCode(code, title = 'Your new recovery code') {
  return modal((close) => {
    const check = h('input', { type: 'checkbox', id: 'saved2' });
    const btn = h('button', { class: 'btn primary', type: 'button', disabled: true, onclick: () => close(true) }, tr('Done'));
    check.addEventListener('change', () => { btn.disabled = !check.checked; });
    return h('div', { class: 'modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
      h('h2', {}, title),
      h('p', {}, tr('Write it on paper and keep it somewhere safe. The previous one no longer works. It will not be shown again.')),
      h('div', { class: 'recovery-code' }, code),
      h('label', { class: 'check', for: 'saved2' }, check, tr('I have kept it somewhere safe')),
      h('div', { class: 'modal-actions' }, btn));
  });
}

// After this device changed vault.json (passphrase, recovery code, key): this device keeps GitHub's copy of it, the
// one it just wrote, and its epoch (made here, so it is the right one). Only when GitHub's copy holds the same key
// slots as what was written: otherwise someone changed it meanwhile, and the next unlock checks it.
async function keepVaultFile(written) {
  let stored = null;
  try { stored = await Vault.fetchVaultFile(S.repo); } catch { /* offline: kept on the next unlock */ }
  // Not readable back, or not what was written: this device's copy stays as it was, so the next key change (or
  // unlock) compares with GitHub's and asks before going on.
  if (!stored || JSON.stringify(stored.keys) !== JSON.stringify(written.keys)) return;
  S.vaultFile = stored;
  Auth.cacheVault(stored);
  Auth.rememberEpoch(C.epochHint(stored));
}

// The vault.json to change: GitHub's, if it still holds the key this device opened; if another device (or someone
// else) changed it meanwhile, nothing is changed and the user unlocks again first.
async function currentVaultFile() {
  const remote = await Vault.fetchVaultFile(S.repo);
  if (remote && JSON.stringify(remote.keys.passphrase) !== JSON.stringify(S.vaultFile.keys.passphrase)) throw new Error('key_changed');
  return remote || S.vaultFile;
}

// Rotate the key: everything is encrypted again with a new key. For when someone may have learned the
// old passphrase: from now on, neither that passphrase nor the old key open what is written.
async function rotateKeyModal() {
  const result = await keyChangeForm(tr('Change the encryption key'),
    tr('All your notes and attachments are encrypted again with a new key, in a single step, and a new recovery code is generated. Your passphrase stays the same (change it afterwards if you want). Your other devices will ask for the passphrase next time. Do not use Snowlog on another device meanwhile.'),
    [passField('rk0', tr('Current passphrase'))],
    tr('Re-encrypt everything'),
    async ([pass]) => {
      await saveNow();
      const st = $('st-sync');
      try {
        const current = await currentVaultFile();
        const res = await S.vault.rotate(current, pass, CONFIG.kdfIterations, (d, t) => {
          S.lastActivity = Date.now();
          st.textContent = trf('Re-encrypting {d}/{t}…', { d, t });
        });
        st.textContent = tr('Uploading…');
        return res;
      } finally {
        st.textContent = '';
      }
    });
  if (!result) return;
  S.dek = S.vault.dek;
  await keepVaultFile(result.vaultFile);
  await Auth.saveCred(S.dek, S.cred);
  await saveExpanded();
  await showNewRecoveryCode(result.recoveryCode);
  notice(tr('Key changed: everything is encrypted with the new key.'));
}

function keyChangeForm(title, text, fields, okText, onSubmit) {
  return modal((close) => {
    const err = errorLine();
    const btn = h('button', { class: 'btn primary', type: 'submit' }, okText);
    const form = h('form', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('h2', {}, title), h('p', {}, text), ...fields.map((f) => f[0]), err,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, tr('Cancel')), btn));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const done = busy(btn, tr('Encrypting…'));
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
  const ok = await keyChangeForm(tr('Change the passphrase'),
    tr('Your other devices will ask for the new passphrase the next time they are unlocked.'),
    [passField('sp0', tr('Current passphrase')), passField('sp1', tr('New passphrase (at least 12 characters)'), 'new-password'), passField('sp2', tr('Repeat the new passphrase'), 'new-password')],
    tr('Change the passphrase'),
    async ([old, p1, p2]) => {
      if (p1.length < 12) throw new Error('Use at least 12 characters.');
      if (p1 !== p2) throw new Error('The two passphrases do not match.');
      if (p1 === old) throw new Error('The new passphrase is the same as the current one.');
      const current = await currentVaultFile();
      const updated = await C.changePassphrase(current, old, p1, CONFIG.kdfIterations);
      await S.vault.writeVaultFile(updated, 'change passphrase');
      await keepVaultFile(updated);
      return true;
    });
  if (ok) notice(tr('Passphrase changed.'));
}

async function renewRecoveryModal() {
  const code = await keyChangeForm(tr('New recovery code'),
    tr('The previous code will stop working. Afterwards you will need to write down the new one.'),
    [passField('sr0', tr('Current passphrase'))],
    tr('Generate code'),
    async ([pass]) => {
      const current = await currentVaultFile();
      const { vault: updated, recoveryCode } = await C.renewRecoveryCode(current, pass, CONFIG.kdfIterations);
      await S.vault.writeVaultFile(updated, 'new recovery code');
      await keepVaultFile(updated);
      return recoveryCode;
    });
  if (!code) return;
  await showNewRecoveryCode(code);
}

// --- Version history ---
const dateFmt = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function whenText(iso) {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  if (ms < 60000) return 'a moment ago';
  if (ms < 3600000) return `${Math.round(ms / 60000)} min ago`;
  if (ms < 86400000) return `${Math.round(ms / 3600000)} h ago`;
  return dateFmt.format(new Date(iso));
}

// Summary of line changes between two texts: { added, removed }.
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
    const list = h('div', { class: 'history-list', role: 'listbox', 'aria-label': tr('Versions') }, h('p', { class: 'search-empty' }, tr('Loading versions…')));
    const preview = h('article', { class: 'history-preview markdown' });
    const info = h('p', { class: 'history-info' });
    const restore = h('button', { class: 'btn primary', type: 'button', disabled: true }, tr('Restore this version'));
    const show = async (i) => {
      sel = i;
      [...list.children].forEach((b, j) => { b.classList.toggle('sel', j === i); b.setAttribute('aria-selected', String(j === i)); });
      const v = versions[i];
      restore.disabled = true;
      preview.replaceChildren(h('p', { class: 'search-empty' }, tr('Decrypting…')));
      try {
        if (!texts.has(v.ref)) texts.set(v.ref, await vault.readVersion(id, v.ref));
        if (sel !== i) return;
        const text = texts.get(v.ref);
        preview.innerHTML = trusted(render(text, { frontmatter: true }));
        const d = lineDiff(current, text);
        info.textContent = i === 0 || text === current
          ? tr('This is the current version.')
          : trn(d.added, 'This version has 1 line the current one does not, and lacks {removed}.', 'This version has {n} lines the current one does not, and lacks {removed}.', { removed: d.removed });
        restore.disabled = i === 0 || text === current;
      } catch (e) {
        preview.replaceChildren(h('p', { class: 'embed-missing' }, trf('This version could not be opened: {error}', { error: errText(e) })));
      }
    };
    restore.addEventListener('click', () => close(texts.get(versions[sel].ref)));
    const box = h('div', { class: 'modal history', role: 'dialog', 'aria-modal': 'true', 'aria-label': tr('Version history') },
      h('h2', {}, trf('History of “{name}”', { name: baseName(note.path) })),
      h('div', { class: 'history-body' }, list, h('div', { class: 'history-right' }, info, preview)),
      h('div', { class: 'modal-actions' },
        h('span', { class: 'history-hint' }, S.local ? tr('A copy is kept at most every 10 minutes.') : tr('Each version stays encrypted in the repository.')),
        h('button', { class: 'btn', type: 'button', onclick: () => close(null) }, tr('Close')),
        restore));
    vault.history(id).then((vs) => {
      versions = vs;
      list.replaceChildren(...vs.map((v, i) => h('button', {
        class: 'switcher-item', type: 'button', role: 'option', onclick: () => show(i),
      }, h('span', {}, i === 0 ? tr('Current') : whenText(v.date)), h('span', { class: 'sub' }, dateFmt.format(new Date(v.date))))));
      if (vs.length) show(0);
      else list.replaceChildren(h('p', { class: 'search-empty' }, tr('No earlier versions.')));
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
  notice(tr('Version restored. The one before is still in the history.'));
}

// --- Drawings (serbenda/bsketch) ---
// They are .sketch attachments (JSON, encrypted online). They are edited right here and shown in notes
// with ![[drawing.sketch]]. The editor comes from sketch and does not use innerHTML.
const SKETCH_TYPE = 'application/vnd.sketch+json';
const isSketch = (id) => S.vault?.index.files?.[id]?.type === SKETCH_TYPE;

function sketchTheme(root) {
  const t = document.documentElement.dataset.theme;
  const dark = t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('sk-dark', dark);
  root.classList.toggle('sk-light', !dark);
}

function sketchFigure(f, bytes, width) {
  let scene;
  try {
    scene = parseSketch(new TextDecoder().decode(bytes));
  } catch {
    return h('span', { class: 'embed embed-missing' }, trf('“{name}” is not a valid drawing', { name: baseName(f.path) }));
  }
  const fig = h('button', { class: 'embed-sketch', type: 'button', title: tr('Open the drawing'), 'aria-label': trf('Drawing {name}. Click to edit it.', { name: baseName(f.path) }), onclick: () => openDrawing(f.id) });
  if (!scene.elements.length) fig.append(h('span', { class: 'embed-sketch-empty' }, trf('Empty drawing: click to draw in “{name}”', { name: baseName(f.path) })));
  else fig.append(sketchSvg(document, scene, { maxWidth: Number(width) || 720 }));
  return fig;
}

async function openDrawing(id) {
  const f = S.vault?.index.files?.[id];
  if (!f) return;
  await saveNow();
  await closeDrawing();
  closeMobilePanels();
  S.current = null;
  $('empty').hidden = true;
  $('note').hidden = true;
  const box = $('drawing');
  box.hidden = false;
  expandTo(f.path);
  D.id = id;
  renderTree();
  const parts = f.path.split('/');
  $('breadcrumb').replaceChildren(...parts.flatMap((p, i) => [i ? h('span', { class: 'crumb-sep' }, '/') : null, h('span', { class: i === parts.length - 1 ? 'crumb-last' : '' }, p)]).filter(Boolean));
  document.title = `${baseName(f.path)} · Snowlog`;
  $('outline').replaceChildren(h('p', { class: 'outline-empty' }, tr('Drawing')));
  refreshBacklinks();
  ensureIndex().then(() => { if (D.id === id) refreshBacklinks(); }).catch(() => {});
  $('st-words').textContent = '';
  $('st-chars').textContent = '';
  setStatus('loading');
  let scene = emptySketch();
  try {
    scene = parseSketch(new TextDecoder().decode(await S.vault.readFile(id)));
    setStatus('saved');
  } catch (e) {
    setStatus('error');
    notice(trf('The drawing could not be opened: {error}', { error: errText(e) }), 'error');
  }
  if (D.id !== id) return;
  D.editor = createSketch(box, {
    scene,
    onChange: () => scheduleDrawingSave(),
    // The library of pieces to reuse lives in the vault (encrypted in a GitHub vault, a plain file in a folder).
    library: { load: () => S.vault.readLibrary(), save: (text) => S.vault.saveLibrary(text) },
    onNotice: (text) => notice(text),
  });
  sketchTheme(D.editor.root);
  D.editor.focus();
}

function scheduleDrawingSave() {
  D.dirty = true;
  setStatus('pending');
  clearTimeout(D.timer);
  D.timer = setTimeout(saveDrawing, S.local ? CONFIG.localSaveDelayMs : CONFIG.saveDelayMs);
}

function saveDrawing() {
  clearTimeout(D.timer);
  if (!D.dirty || !D.id || !D.editor || !S.vault) return D.saving;
  const id = D.id;
  const vault = S.vault;
  const bytes = new TextEncoder().encode(serializeSketch(D.editor.getScene()));
  D.dirty = false;
  setStatus('saving');
  D.saving = D.saving
    .then(() => vault.saveFile(id, bytes, { merge: mergeDrawing }))
    .then((res) => {
      if (D.id === id && !D.dirty) setStatus('saved');
      // Changes from another device were combined: the editor now shows the combined drawing.
      if (res?.merged && D.id === id && !D.dirty && D.editor) {
        try {
          D.editor.setScene(parseSketch(new TextDecoder().decode(res.merged)), { fit: false });
        } catch { /* it will show when reopened */ }
      }
      if (res?.conflict) {
        renderTree();
        notice(trf('This drawing was also changed elsewhere in the same parts: they were combined and the other version is in “{name}”.', { name: baseName(res.conflict.path) }));
      } else if (res?.merged) {
        notice(tr('The changes made to this drawing elsewhere were combined.'));
      }
    })
    .catch((e) => {
      if (D.id === id) {
        D.dirty = true;
        setStatus('error');
      }
      if (e?.message === 'key_changed') keyChanged();
      else notice(trf('The drawing could not be saved: {error}', { error: errText(e) }), 'error');
    });
  return D.saving;
}

// Combines two versions of a drawing element by element (null if either is not a valid drawing).
function mergeDrawing(base, mine, theirs) {
  const dec = (b) => parseSketch(new TextDecoder().decode(b));
  const r = mergeSketch(dec(base), dec(mine), dec(theirs));
  return { bytes: new TextEncoder().encode(serializeSketch(r.scene)), conflict: r.conflict };
}

// Drawings as "notes" for search: name, folder and the texts inside them.
async function drawingNotes() {
  const out = [];
  for (const [id, f] of Object.entries(S.vault?.index.files || {})) {
    if (f.type !== SKETCH_TYPE) continue;
    const ver = f.updated || f.created || '';
    let c = S.drawText.get(id);
    if (!c || c.ver !== ver || c.note.path !== f.path) {
      let text = '';
      try {
        text = parseSketch(new TextDecoder().decode(await S.vault.readFile(id))).elements
          .filter((e) => e.type === 'text').map((e) => e.text).join('\n');
      } catch { /* offline or damaged: searched by name only */ }
      c = { ver, note: { id, path: f.path, name: baseName(f.path), folder: parentPath(f.path), text, tags: new Set(), links: new Set(), fm: {}, tasks: [], ctime: f.created || '', mtime: ver, drawing: true } };
      S.drawText.set(id, c);
    }
    out.push(c.note);
  }
  return out;
}

async function closeDrawing() {
  if (!D.editor) return;
  await saveDrawing();
  D.editor.destroy();
  D.editor = null;
  D.id = null;
  $('drawing').hidden = true;
}

// A new drawing (empty, or from one of the editor's templates), opened; `insert` also embeds it in the open note.
async function newDrawing({ insert = false, template: tplId = null } = {}) {
  if (!S.vault) return;
  const into = insert && S.current ? S.current : null;
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const tpl = tplId ? sketchTemplate(tplId, 'en') : null;
  const name = `${tpl ? tpl.name : 'Drawing'} ${isoDate(d)} ${p(d.getHours())}${p(d.getMinutes())}.sketch`;
  try {
    const { id, path } = await S.vault.addFile(WS.drawingsFolder || '', name, new TextEncoder().encode(serializeSketch(emptySketch())));
    if (into) {
      insertEmbed(path);
      await saveNow();
    }
    await openDrawing(id);
    if (tpl && D.id === id && D.editor) {
      D.editor.insertText(tpl.text, { direction: tpl.direction, keepSelected: false });
      D.editor.zoomToFit();
    }
  } catch (e) {
    notice(trf('The drawing could not be created: {error}', { error: errText(e) }), 'error');
  }
}

// --- Attachments (images and PDFs) ---
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

// Fills the ![[attachment]] placeholders in reading mode with the decrypted image or PDF.
async function fillEmbeds(view) {
  const vault = S.vault;
  for (const slot of view.querySelectorAll('span.embed')) {
    const name = slot.dataset.embed;
    const f = vault.findFile(name);
    if (!f) {
      slot.className = 'embed embed-missing';
      slot.textContent = trf('Attachment “{name}” not found', { name });
      continue;
    }
    slot.className = 'embed embed-loading';
    try {
      const bytes = await vault.readFile(f.id);
      if (S.vault !== vault || !slot.isConnected) return;
      if (f.type === SKETCH_TYPE) {
        slot.replaceWith(sketchFigure(f, bytes, slot.dataset.width));
        continue;
      }
      if (f.type === 'application/pdf') {
        slot.replaceWith(h('span', { class: 'embed-file' },
          h('span', { class: 'embed-file-ext' }, tr('PDF')),
          h('span', { class: 'embed-file-name' }, baseName(f.path), h('small', {}, fmtSize(f.size))),
          h('a', { class: 'embed-open', href: blobUrl(bytes, f.type), target: '_blank', rel: 'noopener' }, tr('Open'))));
      } else {
        const img = h('img', { class: 'embed-img', alt: baseName(f.path), src: `data:${f.type};base64,${C.toB64(bytes)}` });
        if (slot.dataset.width) img.style.width = `${slot.dataset.width}px`;
        img.addEventListener('click', () => openAttachment(f.id));
        slot.replaceWith(img);
      }
    } catch (e) {
      slot.className = 'embed embed-missing';
      slot.textContent = trf('“{name}” could not be opened: {error}', { name, error: errText(e) });
    }
  }
}

// Opens the attachment in a new browser tab.
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

// A short link if the name is unique; otherwise with the path.
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
  // Pasted screenshots arrive as "image.png": they get a name with the date and time.
  if (!file.name || /^image\.\w+$/i.test(file.name)) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `Pasted ${isoDate(d)} ${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
  }
  return file.name;
}

async function attachFiles(files) {
  if (!S.vault || !S.current || !files.length) return;
  const vault = S.vault;
  const folder = WS.attachmentsFolder || '';
  for (const file of files) {
    $('st-sync').textContent = S.local ? tr('Saving attachment…') : tr('Encrypting and uploading attachment…');
    try {
      let name = pastedName(file);
      let data = new Uint8Array(await file.arrayBuffer());
      // An .excalidraw file becomes a sketch drawing; a .sketch file is checked before saving it.
      if (/\.(excalidraw|sketch)$/i.test(name)) {
        data = new TextEncoder().encode(serializeSketch(parseSketch(new TextDecoder().decode(data))));
        name = name.replace(/\.excalidraw$/i, '.sketch');
      }
      const { path } = await vault.addFile(/\.sketch$/i.test(name) ? (WS.drawingsFolder || folder) : folder, name, data);
      if (S.vault !== vault) return;
      expandTo(path);
      insertEmbed(path);
    } catch (e) {
      notice(trf('“{name}” could not be attached: {error}', { name: file.name || tr('image'), error: errText(e) }), 'error');
    }
  }
  setStatus(S.dirty ? 'pending' : 'saved');
  renderTree();
}

async function deleteAttachment(id) {
  const f = S.vault.index.files[id];
  if (!f) return;
  const ok = await confirmModal(tr('Delete attachment'), trf('Delete “{name}”? Notes that show it will no longer see it.', { name: baseName(f.path) }), tr('Delete'), true);
  if (!ok) return;
  await run(() => S.vault.deleteFile(id));
  renderTree();
}

// --- Left panel: files, search and tags ---
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
    box.replaceChildren(h('p', { class: 'search-empty' }, p && p.total ? trf('Decrypting notes ({done} of {total})…', { done: p.done, total: p.total }) : tr('Decrypting notes…')));
  }
  await saveNow();
  await ensureIndex();
  if (seq !== searchSeq || !S.vault) return;
  syncIndex();
  const t0 = performance.now();
  const drawings = await drawingNotes();
  if (seq !== searchSeq || !S.vault) return;
  const results = searchNotes([...indexedNotes(), ...drawings], query);
  const ms = Math.round(performance.now() - t0);
  const total = results.reduce((a, r) => a + r.count, 0);
  const head = h('p', { class: 'search-count' }, results.length
    ? [trn(results.total, '1 note', '{n} notes'), results.total > results.length ? trf('(showing {n})', { n: results.length }) : '', total ? `· ${trn(total, '1 match', '{n} matches')}` : '', `· ${ms} ms`].filter(Boolean).join(' ')
    : tr('No results'));
  box.replaceChildren(head, ...results.map((r) => h('div', { class: 'search-result', role: 'listitem' },
    h('button', { class: 'search-note', type: 'button', title: r.note.path, onclick: () => openResult(r.note.id) },
      h('span', { class: 'search-name' }, r.note.name),
      r.note.drawing ? h('span', { class: 'search-folder' }, r.note.folder ? `${tr('Drawing')} · ${r.note.folder}` : tr('Drawing'))
        : r.note.folder ? h('span', { class: 'search-folder' }, r.note.folder) : null),
    ...r.matches.map((m) => h('button', { class: 'search-line', type: 'button', onclick: () => openResult(r.note.id, m) }, ...marked(m))),
  )));
}

// Snippet text with <mark> on the match (always as text, never HTML).
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
  if (isSketch(id)) {
    await openDrawing(id);
    return;
  }
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
  if (!S.indexReady) list.replaceChildren(h('p', { class: 'search-empty' }, tr('Decrypting notes…')));
  await ensureIndex();
  if (!S.vault || leftTab !== 'tags') return;
  syncIndex();
  const tags = tagCounts(indexedNotes());
  list.replaceChildren(...(tags.length
    ? tags.map(({ tag, count }) => h('button', { class: 'tag-row', type: 'button', role: 'listitem', onclick: () => openSearch(`tag:#${tag}`) },
      h('span', { class: 'tag-name' }, `#${tag}`), h('span', { class: 'tag-count' }, String(count))))
    : [h('p', { class: 'search-empty' }, tr('No tags yet. Write #something in a note.'))]));
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
  } catch { /* no storage */ }
}

function noteMenu(x, y) {
  const items = [];
  if (S.current) {
    const id = S.current;
    items.push(['rename', tr('Rename'), () => renameNotePrompt(id)], ['move', tr('Move to…'), () => moveNotePrompt(id)], ['history', tr('Version history…'), () => historyModal(id)],
      ['bookmark', isBookmarked(id) ? tr('Remove from bookmarks') : tr('Add to bookmarks'), () => toggleBookmark(id)]);
  }
  if (S.current) items.push(['template', tr('Insert template…'), () => insertTemplate()], ['import', tr('Attach an image, PDF or drawing…'), () => $('attach-input').click()], ['sketch', tr('Insert a new drawing'), () => newDrawing({ insert: true })]);
  items.push(
    ['command', tr('Command palette (Ctrl+P)'), () => commandPalette()],
    ['filePlus', tr('New note'), () => newNote()],
    ['template', tr('New note from template…'), () => newFromTemplate()],
    ['kanban', tr('New Kanban board'), () => newBoard()],
    ['sketch', tr('New drawing'), () => newDrawing()],
    ['graph', tr('Graph view (Ctrl+G)'), () => graphView()],
    null,
    ['today', tr('Today\'s note (Ctrl+D)'), () => openDaily()],
    ['home', tr('Dashboard'), () => openHome()],
    ['setup', tr('Set up my space…'), () => setupSpace()],
    ['example', tr('Load examples…'), () => loadExamples()],
    ['import', tr('Import folder…'), () => ACTIONS.import()],
    ['download', S.local ? tr('Backup (.zip)') : tr('Encrypted backup'), () => backupNow()],
  );
  if (!S.local) items.push(['download', tr('Export unencrypted (.zip)'), () => exportZip()]);
  items.push(['import', tr('Import a backup (.snowlog or .zip)…'), () => $('backup-input').click()]);
  items.push(['settings', tr('Settings…'), () => settingsModal()]);
  if (S.local) items.push(['collapse', tr('Reload the folder'), () => reloadLocal()]);
  else items.push(['key', tr('Passphrase and recovery…'), () => securityModal()]);
  if (S.current) items.push(null, ['trash', 'Delete note', () => deleteNote(S.current), 'danger']);
  items.push(null,
    ['lock', S.local ? tr('Close folder') : tr('Lock'), () => lock()],
    ['logout', S.local ? tr('Forget this folder') : tr('Sign out'), () => logout()]);
  openMenu(x, y, items);
}

// --- Actions and shortcuts ---
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
  // A file dropped outside the editor must not take the browser away from Snowlog.
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
    if (ev.key === '?' && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !(ev.target.closest?.('input, textarea, select, [contenteditable="true"]'))) {
      ev.preventDefault();
      helpModal();
      return;
    }
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
  // Switching tab or app (mobile) saves at once.
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
// The web app is stored to open offline (only in the online version served over https or localhost).
function registerServiceWorker() {
  if (CONFIG.mode !== 'online' || !('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  navigator.serviceWorker.register(TT ? TT.createScriptURL('sw.js') : 'sw.js').catch(() => {});
}

// The page's own text (index.html: labels, buttons, placeholders, titles) in the interface's language. What the app
// builds later goes through tr() when it is made.
function translatePage() {
  if (LANG === 'en') return;
  for (const n of document.querySelectorAll('body *:not(script):not(style):not(textarea)')) {
    for (const a of ['title', 'aria-label', 'placeholder']) if (n.hasAttribute(a)) n.setAttribute(a, tr(n.getAttribute(a)));
    for (const c of n.childNodes) {
      if (c.nodeType !== 3 || !c.textContent.trim()) continue;
      const t = c.textContent.trim();
      if (tr(t) !== t) c.textContent = c.textContent.replace(t, tr(t));
    }
  }
}

async function boot() {
  translatePage();
  applyTheme();
  // GitHub Pages does not allow the frame-ancestors header: if someone puts Snowlog in an iframe
  // (to trick clicks on top of it), it does not start.
  if (window.top !== window.self) {
    document.body.textContent = tr('Snowlog cannot be opened inside another page.');
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
