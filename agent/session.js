// Sesión con la bóveda: la DEK vive solo en la memoria de este proceso y se olvida al bloquear
// (a mano o tras `lockAfterMs` sin uso). La frase de paso se pide con `askPassphrase` y se descarta
// en cuanto se deriva la clave: nunca se devuelve, se guarda ni aparece en errores.

import { Vault } from '../public/js/vault.js';
import * as C from '../public/js/crypto.js';
import { CONFIG } from '../public/js/config.js';
import { parseNote } from '../public/js/noteindex.js';

export class SessionError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

export class Session {
  constructor({ repo, askPassphrase, lockAfterMs = CONFIG.lockAfterMinutes * 60000, refreshMs = 10000, attempts = 3 }) {
    this.repo = repo;
    this.askPassphrase = askPassphrase;
    this.lockAfterMs = lockAfterMs;
    this.refreshMs = refreshMs;
    this.attempts = attempts;
    this.vault = null;
    this.parsed = new Map(); // id → nota analizada (parseNote), por versión
    this.timer = null;
    this.freshAt = 0;
    this.lockedReason = null;
  }

  get unlocked() {
    return !!this.vault;
  }

  async unlock() {
    if (this.vault) return this.vault;
    const vaultFile = await Vault.fetchVaultFile(this.repo);
    if (!vaultFile) throw new SessionError('no_vault', 'En este repo no hay una bóveda de Snowlog.');
    let message = 'Frase de paso de la bóveda de Snowlog';
    let dek = null;
    for (let i = 0; i < this.attempts && !dek; i++) {
      const secret = await this.askPassphrase(message);
      if (secret == null) throw new SessionError('cancelled', 'Desbloqueo cancelado.');
      try {
        dek = await C.unlockVault(vaultFile, secret);
      } catch {
        message = 'Frase incorrecta. Vuelve a escribir la frase de paso de Snowlog';
      }
    }
    if (!dek) throw new SessionError('bad_secret', 'Frase de paso incorrecta.');
    const vault = new Vault(this.repo, dek);
    await vault.loadIndex();
    this.vault = vault;
    this.freshAt = Date.now();
    this.lockedReason = null;
    this.touch();
    return vault;
  }

  lock(reason = 'manual') {
    this.vault = null; // la DEK y las notas descifradas se quedan sin referencias
    this.parsed.clear();
    this.lockedReason = reason;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  touch() {
    if (this.timer) clearTimeout(this.timer);
    if (!this.lockAfterMs) return;
    this.timer = setTimeout(() => this.lock('idle'), this.lockAfterMs);
    this.timer.unref?.();
  }

  // Bóveda lista para usar: desbloquea si hace falta y trae lo que hayan cambiado otros dispositivos.
  async open({ refresh = false } = {}) {
    if (!this.vault) {
      await this.unlock();
    } else if (refresh || Date.now() - this.freshAt > this.refreshMs) {
      try {
        await this.repo.fetchHead();
        await this.vault.loadIndex();
      } catch (e) {
        if (e.message === 'key_changed') {
          // Se rotó la clave desde la app: hay que volver a pedir la frase.
          this.lock('key_changed');
          await this.unlock();
        } else if (e instanceof TypeError) {
          throw new SessionError('offline', 'Sin conexión con el repo de notas.');
        } else throw e;
      }
      this.freshAt = Date.now();
    }
    this.touch();
    return this.vault;
  }

  // Tras escribir: si Vault se quedó sin conexión, lo escrito solo está en memoria. Se avisa.
  assertSaved() {
    if (this.vault?.offline) {
      throw new SessionError('offline', 'Sin conexión: el cambio no se ha subido. Vuelve a intentarlo con red.');
    }
  }

  settings() {
    return { ...CONFIG.workspace, ...(this.vault?.getSettings() || {}) };
  }

  // Todas las notas descifradas y analizadas (para buscar y para los enlaces).
  async allNotes() {
    const v = await this.open();
    const metas = v.notes();
    await v.prefetch(metas.map((n) => n.id));
    const out = [];
    for (const m of metas) {
      let p = this.parsed.get(m.id);
      if (!p || p.mtime !== m.updated || p.path !== m.path) {
        const text = await v.read(m.id);
        p = parseNote({ id: m.id, path: m.path, text, created: m.created, updated: m.updated });
        this.parsed.set(m.id, p);
      }
      out.push(p);
    }
    for (const id of [...this.parsed.keys()]) if (!v.index.notes[id]) this.parsed.delete(id);
    return out;
  }
}
