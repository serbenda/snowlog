// Copia de seguridad cifrada (.snowlog): un único fichero que se abre sin GitHub y sin Snowlog
// instalado, solo con la frase de paso o el código de recuperación.
//
//   { app: 'snowlog-backup', v: 1, created, notes, files, vault: <vault.json>, data: base64(iv || cifrado) }
//
// `vault` lleva la clave de datos envuelta, como en el repo; `data` es un .zip con las notas (.md)
// y los adjuntos, cifrado con esa clave. Nada va en claro salvo la fecha y los recuentos.

import * as C from './crypto.js';
import { makeZip, readZip } from './zip.js';

const AAD = 'snowlog-backup';

// files: [{ path, text }] o [{ path, data }], como para makeZip.
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
