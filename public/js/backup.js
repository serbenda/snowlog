// Encrypted backup (.snowlog): a single file that opens without GitHub and without Snowlog
// installed, with just the passphrase or the recovery code.
//
//   { app: 'snowlog-backup', v: 1, created, notes, files, vault: <vault.json>, data: base64(iv || ciphertext) }
//
// `vault` holds the wrapped data key, as in the repo; `data` is a .zip with the notes (.md)
// and the attachments, encrypted with that key. Nothing is in plaintext except the date and the counts.

import * as C from './crypto.js';
import { makeZip, readZip } from './zip.js';

const AAD = 'snowlog-backup';

// files: [{ path, text }] or [{ path, data }], as for makeZip.
export async function makeBackup(vaultFile, dek, files, now = new Date()) {
  const zip = makeZip(files, now);
  const backup = {
    app: 'snowlog-backup',
    v: 1,
    created: now.toISOString(),
    notes: files.filter((f) => f.path.endsWith('.md')).length,
    files: files.length,
    vault: vaultFile,
    data: C.toB64(await C.encryptBytes(dek, zip, AAD)),
  };
  return new TextEncoder().encode(`${JSON.stringify(backup)}\n`);
}

export function parseBackup(bytes) {
  let b;
  try {
    b = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('bad_backup');
  }
  if (b?.app !== 'snowlog-backup' || b.v !== 1 || !b.vault?.keys || typeof b.data !== 'string') throw new Error('bad_backup');
  return b;
}

// Devuelve { created, zip, files: [{ path, data }] } o lanza bad_secret / bad_backup.
export async function openBackup(bytes, secret) {
  const b = parseBackup(bytes);
  const dek = await C.unlockWithAny(b.vault, secret);
  let zip;
  try {
    zip = await C.decryptBytes(dek, C.fromB64(b.data), AAD);
  } catch {
    throw new Error('bad_backup');
  }
  return { created: b.created, zip, files: readZip(zip) };
}
