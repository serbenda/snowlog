// Login con GitHub (GitHub App + Cloudflare Worker) o con token personal,
// y almacenamiento local de credenciales SIEMPRE cifradas con la clave de la bóveda.

import { CONFIG } from './config.js';
import * as C from './crypto.js';

const LS_VAULT = 'snowlog.vault';
const LS_CRED = 'snowlog.cred';
const SS_STATE = 'snowlog.oauthState';

export const oauthAvailable = () => Boolean(CONFIG.githubClientId && CONFIG.authWorker);

export const redirectUri = () => `${location.origin}${location.pathname}`;

export function startOAuth() {
  const state = C.randomId(16);
  sessionStorage.setItem(SS_STATE, state);
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', CONFIG.githubClientId);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('state', state);
  location.assign(url.toString());
}

// Si volvemos de GitHub con ?code=…, lo cambia por un token. Si no, devuelve null.
export async function finishOAuth() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (!code && !params.get('error')) return null;
  history.replaceState(null, '', redirectUri());
  const expected = sessionStorage.getItem(SS_STATE);
  sessionStorage.removeItem(SS_STATE);
  if (params.get('error')) throw new Error('oauth_denied');
  if (!expected || expected !== state) throw new Error('bad_state');
  return toCred(await workerPost('/token', { code, redirect_uri: redirectUri() }));
}

function toCred(d) {
  const now = Date.now();
  return {
    type: 'oauth',
    token: d.access_token,
    expiresAt: d.expires_in ? now + Number(d.expires_in) * 1000 : null,
    refreshToken: d.refresh_token || null,
    refreshExpiresAt: d.refresh_token_expires_in ? now + Number(d.refresh_token_expires_in) * 1000 : null,
  };
}

async function workerPost(path, body) {
  if (!CONFIG.authWorker) throw new Error('no_worker');
  const res = await fetch(`${CONFIG.authWorker}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || !data.access_token) throw new Error(data.error || 'auth_failed');
  return data;
}

export const canRefresh = (cred) => cred?.type === 'oauth'
  && Boolean(cred.refreshToken)
  && (!cred.refreshExpiresAt || Date.now() < cred.refreshExpiresAt);

export const needsRefresh = (cred) => cred?.type === 'oauth'
  && Boolean(cred.expiresAt)
  && Date.now() > cred.expiresAt - 5 * 60 * 1000;

export async function refresh(cred) {
  if (!canRefresh(cred)) throw new Error('session_expired');
  return toCred(await workerPost('/refresh', { refresh_token: cred.refreshToken }));
}

export const patCred = (token) => ({ type: 'pat', token: token.trim() });

// --- Caché local (todo lo sensible va cifrado con la clave de la bóveda) ---

export function cachedVault() {
  try {
    return JSON.parse(localStorage.getItem(LS_VAULT) || 'null');
  } catch {
    return null;
  }
}

export function cacheVault(vaultFile) {
  try {
    localStorage.setItem(LS_VAULT, JSON.stringify(vaultFile));
  } catch { /* almacenamiento no disponible */ }
}

export async function saveCred(dek, cred) {
  try {
    localStorage.setItem(LS_CRED, await C.encryptText(dek, JSON.stringify(cred), 'cred'));
  } catch { /* almacenamiento no disponible */ }
}

export async function loadCred(dek) {
  try {
    const text = localStorage.getItem(LS_CRED);
    return text ? JSON.parse(await C.decryptText(dek, text, 'cred')) : null;
  } catch {
    return null;
  }
}

export function forgetDevice() {
  try {
    localStorage.removeItem(LS_VAULT);
    localStorage.removeItem(LS_CRED);
    localStorage.removeItem('snowlog.last');
  } catch { /* nada que borrar */ }
}
