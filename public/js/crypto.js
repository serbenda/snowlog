// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// End-to-end encryption with WebCrypto.
//
// Esquema:
// - A random AES-256-GCM data key (DEK) encrypts all the content.
// - The DEK is stored "wrapped" (encrypted) with a key derived from the passphrase
//   and, separately, with a key derived from the recovery code.
// - Each file is encrypted with a new random IV and with its identifier as
//   additional authenticated data (AAD), so one file cannot be swapped for another.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const IV_BYTES = 12;

export function randomBytes(n) {
  const b = new Uint8Array(n);
  // getRandomValues accepts at most 65,536 bytes per call.
  for (let i = 0; i < n; i += 65536) globalThis.crypto.getRandomValues(b.subarray(i, Math.min(n, i + 65536)));
  return b;
}

export function toB64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

export function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Random identifier for file names (reveals nothing about the title).
export function randomId(bytes = 12) {
  return Array.from(randomBytes(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function deriveKek(secret, salt, iterations) {
  const base = await subtle.importKey('raw', enc.encode(secret.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function importDek(raw) {
  return subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptBytes(key, plain, aad) {
  const iv = randomBytes(IV_BYTES);
  const params = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = enc.encode(aad);
  const ct = new Uint8Array(await subtle.encrypt(params, key, plain));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return out;
}

export async function decryptBytes(key, data, aad) {
  const iv = data.subarray(0, IV_BYTES);
  const params = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = enc.encode(aad);
  return new Uint8Array(await subtle.decrypt(params, key, data.subarray(IV_BYTES)));
}

// Text -> base64(iv || ciphertext). This is what is stored in the repository.
export async function encryptText(key, text, aad) {
  return toB64(await encryptBytes(key, enc.encode(text), aad));
}

export async function decryptText(key, b64, aad) {
  return dec.decode(await decryptBytes(key, fromB64(b64.trim()), aad));
}

// Readable recovery code: 25 characters in 5 groups (~125 bits).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newRecoveryCode() {
  const bytes = randomBytes(25);
  const chars = Array.from(bytes, (b) => ALPHABET[b % 32]).join('');
  return chars.match(/.{5}/g).join('-');
}
export function normalizeRecoveryCode(code) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Creates the vault: a new DEK wrapped with the passphrase and with the recovery code.
export async function createVault(passphrase, iterations) {
  const rawDek = randomBytes(32);
  const recoveryCode = newRecoveryCode();
  const pSalt = randomBytes(16);
  const rSalt = randomBytes(16);
  const pKek = await deriveKek(passphrase, pSalt, iterations);
  const rKek = await deriveKek(normalizeRecoveryCode(recoveryCode), rSalt, iterations);
  const vault = {
    app: 'snowlog',
    v: 1,
    created: new Date().toISOString(),
    keys: {
      passphrase: {
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(pSalt) },
        wrapped: toB64(await encryptBytes(pKek, rawDek, 'dek')),
      },
      recovery: {
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(rSalt) },
        wrapped: toB64(await encryptBytes(rKek, rawDek, 'dek')),
      },
    },
  };
  const dek = await importDek(rawDek);
  rawDek.fill(0);
  return { vault, dek, recoveryCode };
}

async function wrapSlot(raw, secret, iterations) {
  const salt = randomBytes(16);
  const kek = await deriveKek(secret, salt, iterations);
  return {
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) },
    wrapped: toB64(await encryptBytes(kek, raw, 'dek')),
  };
}

// Changes the passphrase: checks the current one and wraps the same DEK again with the new one
// (notes are not re-encrypted). Raises the iterations if `iterations` is higher than the stored ones.
export async function changePassphrase(vault, oldPassphrase, newPassphrase, iterations = 0) {
  let raw;
  try {
    raw = await unwrapWith(vault.keys.passphrase, oldPassphrase);
  } catch {
    throw new Error('bad_secret');
  }
  const updated = structuredClone(vault);
  updated.keys.passphrase = await wrapSlot(raw, newPassphrase, Math.max(iterations, vault.keys.passphrase.kdf.iterations));
  raw.fill(0);
  return updated;
}

// Generates a new recovery code (the previous one stops working). Asks for the current passphrase.
export async function renewRecoveryCode(vault, passphrase, iterations = 0) {
  let raw;
  try {
    raw = await unwrapWith(vault.keys.passphrase, passphrase);
  } catch {
    throw new Error('bad_secret');
  }
  const recoveryCode = newRecoveryCode();
  const updated = structuredClone(vault);
  updated.keys.recovery = await wrapSlot(raw, normalizeRecoveryCode(recoveryCode), Math.max(iterations, vault.keys.recovery.kdf.iterations));
  raw.fill(0);
  return { vault: updated, recoveryCode };
}

async function unwrapWith(slot, secret) {
  const kek = await deriveKek(secret, fromB64(slot.kdf.salt), slot.kdf.iterations);
  return decryptBytes(kek, fromB64(slot.wrapped), 'dek');
}

// Returns the DEK, or throws Error('bad_secret') if the passphrase is wrong.
export async function unlockVault(vault, passphrase) {
  let raw;
  try {
    raw = await unwrapWith(vault.keys.passphrase, passphrase);
  } catch {
    throw new Error('bad_secret');
  }
  const dek = await importDek(raw);
  raw.fill(0);
  return dek;
}

// Rotates the key: a new random DEK, wrapped with the passphrase (which is checked) and with a new
// recovery code. Also returns the old DEK in base64 (`oldKey`) to store it encrypted with the new one
// in the keyring, so the history can still be read.
export async function rotateVault(vault, passphrase, iterations = 0) {
  let raw;
  try {
    raw = await unwrapWith(vault.keys.passphrase, passphrase);
  } catch {
    throw new Error('bad_secret');
  }
  const fresh = randomBytes(32);
  const recoveryCode = newRecoveryCode();
  const updated = structuredClone(vault);
  updated.rotated = new Date().toISOString();
  updated.keys = {
    passphrase: await wrapSlot(fresh, passphrase, Math.max(iterations, vault.keys.passphrase.kdf.iterations)),
    recovery: await wrapSlot(fresh, normalizeRecoveryCode(recoveryCode), Math.max(iterations, vault.keys.recovery.kdf.iterations)),
  };
  const dek = await importDek(fresh);
  const oldKey = toB64(raw);
  fresh.fill(0);
  raw.fill(0);
  return { vault: updated, dek, recoveryCode, oldKey };
}

export async function importKey(b64) {
  const raw = fromB64(b64);
  const key = await importDek(raw);
  raw.fill(0);
  return key;
}

// Opens the DEK with the passphrase or, if that fails, with the recovery code.
export async function unlockWithAny(vault, secret) {
  for (const [slot, value] of [[vault.keys.passphrase, secret], [vault.keys.recovery, normalizeRecoveryCode(secret)]]) {
    try {
      const raw = await unwrapWith(slot, value);
      const dek = await importDek(raw);
      raw.fill(0);
      return dek;
    } catch { /* try the next one */ }
  }
  throw new Error('bad_secret');
}

// With the recovery code, a new passphrase is set.
// Returns the updated vault and the DEK.
export async function recoverVault(vault, recoveryCode, newPassphrase) {
  let raw;
  try {
    raw = await unwrapWith(vault.keys.recovery, normalizeRecoveryCode(recoveryCode));
  } catch {
    throw new Error('bad_secret');
  }
  const iterations = vault.keys.passphrase.kdf.iterations;
  const salt = randomBytes(16);
  const kek = await deriveKek(newPassphrase, salt, iterations);
  const updated = structuredClone(vault);
  updated.keys.passphrase = {
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) },
    wrapped: toB64(await encryptBytes(kek, raw, 'dek')),
  };
  const dek = await importDek(raw);
  raw.fill(0);
  return { vault: updated, dek };
}
