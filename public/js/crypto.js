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

// --- Key slots ---
// A slot is the DEK wrapped with a key derived from a secret (the passphrase or the recovery code). Its `seal` is the
// vault's epoch encrypted with that same derived key: it goes up with every change of key or passphrase, and no one
// can raise or forge it without the secret. A device remembers the highest epoch it has opened and refuses a
// vault.json from GitHub with a lower one (a rollback to an earlier key). Slots without a seal (vaults made before
// 2026-11-26) count as epoch 0 and get one on their next change.
//
// The PBKDF2 work a slot asks for is checked before anything is derived: never below KDF_LIMITS.min (a changed file
// can't make a new passphrase cheap to crack) nor above KDF_LIMITS.max (it can't make unlocking hang). Tests lower
// `min` to run fast.
export const KDF_LIMITS = { min: 600000, max: 10000000 };
const MAX_EPOCH = 1e9;

function iterationsOf(slot) {
  const n = slot?.kdf?.iterations;
  if (!Number.isInteger(n) || n < KDF_LIMITS.min || n > KDF_LIMITS.max) throw new Error('bad_vault');
  return n;
}

const epochFrom = (text) => {
  const n = Number(text);
  if (!Number.isInteger(n) || n < 0 || n > MAX_EPOCH) throw new Error('bad_vault');
  return n;
};

// The plaintext hint of the epoch (unauthenticated: only used to pick a higher number, never to trust one).
export function epochHint(vault) {
  const n = vault?.epoch;
  return Number.isInteger(n) && n >= 0 && n <= MAX_EPOCH ? n : 0;
}

async function wrapSlot(raw, secret, iterations, epoch) {
  const salt = randomBytes(16);
  const kek = await deriveKek(secret, salt, iterations);
  return {
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) },
    wrapped: toB64(await encryptBytes(kek, raw, 'dek')),
    seal: await encryptText(kek, String(epoch), 'epoch'),
  };
}

// Opens a slot: { raw, epoch }. Throws bad_vault if the slot is malformed or its seal doesn't open (changed), and
// bad_secret if the secret is wrong.
async function openSlot(slot, secret) {
  const iterations = iterationsOf(slot);
  let kek;
  let raw;
  try {
    kek = await deriveKek(secret, fromB64(slot.kdf.salt), iterations);
    raw = await decryptBytes(kek, fromB64(slot.wrapped), 'dek');
  } catch {
    throw new Error('bad_secret');
  }
  if (slot.seal === undefined) return { raw, epoch: 0 };
  try {
    return { raw, epoch: epochFrom(await decryptText(kek, slot.seal, 'epoch')) };
  } catch {
    raw.fill(0);
    throw new Error('bad_vault');
  }
}

// Creates the vault: a new DEK wrapped with the passphrase and with the recovery code, at epoch 1.
export async function createVault(passphrase, iterations) {
  const rawDek = randomBytes(32);
  const recoveryCode = newRecoveryCode();
  const vault = {
    app: 'snowlog',
    v: 1,
    created: new Date().toISOString(),
    epoch: 1,
    keys: {
      passphrase: await wrapSlot(rawDek, passphrase, iterations, 1),
      recovery: await wrapSlot(rawDek, normalizeRecoveryCode(recoveryCode), iterations, 1),
    },
  };
  const dek = await importDek(rawDek);
  rawDek.fill(0);
  return { vault, dek, recoveryCode };
}

// Changes the passphrase: checks the current one and wraps the same DEK again with the new one
// (notes are not re-encrypted). Raises the iterations if `iterations` is higher than the stored ones.
export async function changePassphrase(vault, oldPassphrase, newPassphrase, iterations = 0) {
  const { raw, epoch } = await openSlot(vault.keys.passphrase, oldPassphrase);
  const next = Math.max(epoch, epochHint(vault)) + 1;
  const updated = structuredClone(vault);
  updated.epoch = next;
  updated.keys.passphrase = await wrapSlot(raw, newPassphrase, Math.max(iterations, vault.keys.passphrase.kdf.iterations), next);
  raw.fill(0);
  return updated;
}

// Generates a new recovery code (the previous one stops working). Asks for the current passphrase.
export async function renewRecoveryCode(vault, passphrase, iterations = 0) {
  const { raw, epoch } = await openSlot(vault.keys.passphrase, passphrase);
  const recoveryCode = newRecoveryCode();
  const updated = structuredClone(vault);
  updated.keys.recovery = await wrapSlot(raw, normalizeRecoveryCode(recoveryCode), Math.max(iterations, iterationsOf(vault.keys.recovery)), epoch);
  raw.fill(0);
  return { vault: updated, recoveryCode };
}

// Returns the DEK, or throws bad_secret if the passphrase is wrong (bad_vault if vault.json is malformed or changed).
export async function unlockVault(vault, passphrase) {
  return (await openVault(vault, passphrase)).dek;
}

// The DEK and the vault's authenticated epoch.
export async function openVault(vault, passphrase) {
  const { raw, epoch } = await openSlot(vault.keys.passphrase, passphrase);
  const dek = await importDek(raw);
  raw.fill(0);
  return { dek, epoch };
}

// Rotates the key: a new random DEK, wrapped with the passphrase (which is checked) and with a new
// recovery code, at the next epoch. Also returns the old DEK in base64 (`oldKey`) to store it encrypted with the new
// one in the keyring, so the history can still be read.
export async function rotateVault(vault, passphrase, iterations = 0) {
  const { raw, epoch } = await openSlot(vault.keys.passphrase, passphrase);
  const next = Math.max(epoch, epochHint(vault)) + 1;
  const fresh = randomBytes(32);
  const recoveryCode = newRecoveryCode();
  const updated = structuredClone(vault);
  updated.rotated = new Date().toISOString();
  updated.epoch = next;
  updated.keys = {
    passphrase: await wrapSlot(fresh, passphrase, Math.max(iterations, vault.keys.passphrase.kdf.iterations), next),
    recovery: await wrapSlot(fresh, normalizeRecoveryCode(recoveryCode), Math.max(iterations, iterationsOf(vault.keys.recovery)), next),
  };
  const dek = await importDek(fresh);
  const oldKey = toB64(raw);
  fresh.fill(0);
  raw.fill(0);
  return { vault: updated, dek, recoveryCode, oldKey, epoch: next };
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
      const { raw } = await openSlot(slot, value);
      const dek = await importDek(raw);
      raw.fill(0);
      return dek;
    } catch (e) {
      if (e.message === 'bad_vault') throw e;
    }
  }
  throw new Error('bad_secret');
}

// With the recovery code, a new passphrase is set, at an epoch above every one known (`knownEpoch`: the highest this
// device has opened). The new slot uses at least `iterations` and never fewer than KDF_LIMITS.min.
// Returns the updated vault, the DEK and the new epoch.
export async function recoverVault(vault, recoveryCode, newPassphrase, { iterations = 0, knownEpoch = 0 } = {}) {
  const { raw, epoch } = await openSlot(vault.keys.recovery, normalizeRecoveryCode(recoveryCode));
  iterationsOf(vault.keys.passphrase); // a malformed slot is refused, not copied
  const next = Math.max(epoch, epochHint(vault), knownEpoch) + 1;
  const updated = structuredClone(vault);
  updated.epoch = next;
  updated.keys.passphrase = await wrapSlot(raw, newPassphrase, Math.max(iterations, KDF_LIMITS.min, vault.keys.passphrase.kdf.iterations), next);
  const dek = await importDek(raw);
  raw.fill(0);
  return { vault: updated, dek, epoch: next };
}
