// Snowlog: interfaz principal.
import { CONFIG } from './config.js';
import * as C from './crypto.js';
import * as Auth from './auth.js';
import { GitHubRepo } from './github.js';
import { Vault, baseName, parentPath, normalizePath } from './vault.js';
import { render, outline, wordCount } from './markdown.js';

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
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;

const $ = (id) => document.getElementById(id);
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
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
  expanded: new Set(JSON.parse(localStorage.getItem('snowlog.expanded') || '[]')),
  lastActivity: Date.now(),
};

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
  };
  if (map[m]) return map[m];
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
      h('button', { class: 'link-btn', type: 'button', onclick: () => { tokenForm.hidden = false; tokenInput.focus(); } }, 'Usar un token personal')),
    tokenForm,
    err,
  );
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
        S.dek = null;
        S.cred = null;
        return showLogin(errText(e));
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
  S.vault = new Vault(S.repo, S.dek);
  await S.vault.loadIndex();
  enterApp();
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
      S.vault = new Vault(S.repo, dek);
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
  $('title').value = '';
  $('reading').replaceChildren();
  $('tree').replaceChildren();
  $('outline').replaceChildren();
}

async function lock() {
  if (!S.vault) return;
  await saveNow();
  wipe();
  const cached = Auth.cachedVault();
  if (cached) showUnlock(cached);
  else showLogin();
}

async function logout() {
  const ok = await confirmModal('¿Cerrar sesión?', 'Se bloquea Snowlog y se olvida este dispositivo. Tus notas en GitHub no se tocan.', 'Cerrar sesión');
  if (!ok) return;
  await saveNow();
  Auth.forgetDevice();
  wipe();
  showLogin('Sesión cerrada.');
}

function trackActivity() {
  const mark = () => { S.lastActivity = Date.now(); };
  for (const ev of ['keydown', 'pointerdown', 'wheel', 'touchstart']) addEventListener(ev, mark, { passive: true });
  setInterval(() => {
    if (S.vault && Date.now() - S.lastActivity > CONFIG.lockAfterMinutes * 60000) lock();
  }, 15000);
}

// ---------------------------------------------------------------------------
// App
function enterApp() {
  $('lock').hidden = true;
  $('app').hidden = false;
  S.lastActivity = Date.now();
  renderTree();
  const last = localStorage.getItem('snowlog.last');
  const first = S.vault.notes().sort((a, b) => b.updated.localeCompare(a.updated))[0];
  const target = (last && S.vault.index.notes[last]) ? last : first?.id;
  if (target) openNote(target);
  else showEmpty();
}

function showEmpty() {
  S.current = null;
  $('note').hidden = true;
  $('empty').hidden = false;
  $('breadcrumb').replaceChildren();
  $('outline').replaceChildren(h('p', { class: 'outline-empty' }, 'Sin nota abierta'));
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
}

function moreButton() {
  return h('button', { class: 'icon-btn row-more', type: 'button', 'aria-label': 'Opciones', tabindex: '-1', html: icon('more') });
}

function toggleFolder(path) {
  if (S.expanded.has(path)) S.expanded.delete(path);
  else S.expanded.add(path);
  localStorage.setItem('snowlog.expanded', JSON.stringify([...S.expanded]));
  renderTree();
}

function expandTo(path) {
  const parts = parentPath(path).split('/').filter(Boolean);
  for (let i = 1; i <= parts.length; i++) S.expanded.add(parts.slice(0, i).join('/'));
  localStorage.setItem('snowlog.expanded', JSON.stringify([...S.expanded]));
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
  if (row.dataset.note) {
    const id = row.dataset.note;
    openMenu(x, y, [
      ['rename', 'Renombrar', () => renameNotePrompt(id)],
      ['move', 'Mover a…', () => moveNotePrompt(id)],
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
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`;
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
  const ok = await run(() => S.vault.renameNote(id, path).then(() => true));
  renderTree();
  if (id === S.current) updateHeader();
  return ok;
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
  const ok = await run(() => S.vault.renameFolder(path, to).then(() => true));
  if (ok) {
    if (S.expanded.delete(path)) S.expanded.add(to);
    renderTree();
    if (S.current) updateHeader();
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
  $('editor').hidden = reading;
  $('reading').hidden = !reading;
  if (reading) $('reading').innerHTML = render($('editor').value, { frontmatter: true });
  const btn = $('mode-btn');
  btn.innerHTML = icon(reading ? 'edit' : 'read');
  btn.setAttribute('aria-label', reading ? 'Cambiar a edición (Ctrl+E)' : 'Cambiar a lectura (Ctrl+E)');
  btn.title = reading ? 'Editar (Ctrl+E)' : 'Lectura (Ctrl+E)';
  if (!reading) autosize();
}

function autosize() {
  const ed = $('editor');
  ed.style.height = 'auto';
  ed.style.height = `${Math.max(ed.scrollHeight, 200)}px`;
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

function setStatus(kind) {
  const el = $('st-sync');
  const text = {
    loading: 'Descifrando…', pending: 'Sin guardar', saving: 'Cifrando y guardando…', saved: 'Guardado', error: 'Error al guardar', '': '',
  }[kind];
  el.textContent = text;
  el.className = kind === 'error' ? 'error' : '';
}

function scheduleSave() {
  S.dirty = true;
  setStatus('pending');
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(saveNow, CONFIG.saveDelayMs);
}

function saveNow() {
  clearTimeout(S.saveTimer);
  if (!S.dirty || !S.current || !S.vault) return S.saving;
  const id = S.current;
  const text = $('editor').value;
  const vault = S.vault;
  S.dirty = false;
  setStatus('saving');
  S.saving = S.saving
    .then(() => vault.saveNote(id, text))
    .then(() => {
      if (!S.dirty && S.current === id) setStatus('saved');
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

// --- Paneles ---
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
    items.push(['rename', 'Renombrar', () => renameNotePrompt(id)], ['move', 'Mover a…', () => moveNotePrompt(id)]);
  }
  items.push(['search', 'Abrir nota (Ctrl+O)', () => quickSwitcher()], ['filePlus', 'Nueva nota', () => newNote()]);
  if (S.current) items.push(null, ['trash', 'Eliminar nota', () => deleteNote(S.current), 'danger']);
  items.push(null, ['lock', 'Bloquear', () => lock()], ['logout', 'Cerrar sesión', () => logout()]);
  openMenu(x, y, items);
}

// --- Acciones y atajos ---
const ACTIONS = {
  'toggle-left': () => togglePanel('left'),
  'toggle-right': () => togglePanel('right'),
  switcher: () => quickSwitcher(),
  'new-note': () => newNote(),
  'new-folder': () => newFolder(''),
  'collapse-all': () => { S.expanded.clear(); localStorage.setItem('snowlog.expanded', '[]'); renderTree(); },
  'toggle-mode': () => S.current && setMode(S.mode === 'edit' ? 'read' : 'edit'),
  'note-menu': (btn) => { const r = btn.getBoundingClientRect(); noteMenu(r.right - 200, r.bottom + 4); },
  lock: () => lock(),
  logout: () => logout(),
};

const BUTTON_ICONS = {
  'toggle-left': 'files', switcher: 'search', 'new-note': 'filePlus', 'new-folder': 'folderPlus', 'collapse-all': 'collapse',
  lock: 'lock', logout: 'logout', 'note-menu': 'more', 'toggle-right': 'sidebarRight', 'toggle-mode': 'read',
};

function setupUi() {
  document.querySelectorAll('[data-action]').forEach((btn) => {
    if (!btn.classList.contains('link-btn') && BUTTON_ICONS[btn.dataset.action]) {
      btn.innerHTML = icon(btn.classList.contains('mobile-only') ? 'menu' : BUTTON_ICONS[btn.dataset.action]);
    }
    btn.addEventListener('click', () => ACTIONS[btn.dataset.action]?.(btn));
  });
  const app = $('app');
  if (localStorage.getItem('snowlog.leftClosed')) app.classList.add('left-closed');
  if (localStorage.getItem('snowlog.rightClosed')) app.classList.add('right-closed');
  $('backdrop').addEventListener('click', closeMobilePanels);

  const editor = $('editor');
  editor.addEventListener('input', () => {
    scheduleSave();
    autosize();
    clearTimeout(sideTimer);
    sideTimer = setTimeout(refreshSide, 300);
  });
  editor.addEventListener('keydown', (ev) => {
    if (ev.key === 'Tab' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault();
      document.execCommand('insertText', false, '\t');
    }
  });

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
    if (ev.key === 'Escape' && !$('menu').hidden) closeMenu();
    if (!S.vault || $('app').hidden || $('modal-root').childElementCount) return;
    const mod = ev.ctrlKey || ev.metaKey;
    if (!mod || ev.altKey) return;
    const k = ev.key.toLowerCase();
    if (k === 'e') { ev.preventDefault(); ACTIONS['toggle-mode'](); }
    else if (k === 'o' || k === 'p') { ev.preventDefault(); quickSwitcher(); }
    else if (k === 'n') { ev.preventDefault(); newNote(); }
    else if (k === 's') { ev.preventDefault(); saveNow(); }
  });

  addEventListener('beforeunload', (ev) => {
    if (S.dirty) {
      saveNow();
      ev.preventDefault();
    }
  });
  addEventListener('resize', () => { if (!isMobile()) closeMobilePanels(); });
  setupTree();
}

// ---------------------------------------------------------------------------
async function boot() {
  setupUi();
  trackActivity();
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
