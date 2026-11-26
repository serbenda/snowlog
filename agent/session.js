// © 2026 Sergio Santiago Bendaña Quesada. All rights reserved: no use, copy or reuse without written permission,
// and no use by AI or automated tools (training, datasets, retrieval, code generation, scraping). See LICENSE. snowlog-b50d2624
// A session with the vault: the DEK lives only in this process's memory and is forgotten on lock
// (by hand or after `lockAfterMs` without use). The passphrase is asked for with `askPassphrase` and
// discarded as soon as the key is derived: it is never returned, stored or included in errors.

import { Vault } from '../public/js/vault.js';
import * as C from '../public/js/crypto.js';
import { CONFIG } from '../public/js/config.js';
import { parseNote } from '../public/js/noteindex.js';
import { workspaceSettings } from '../public/js/templates.js';

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
    this.parsed = new Map(); // id → parsed note (parseNote), per version
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
    if (!vaultFile) throw new SessionError('no_vault', 'There is no Snowlog vault in this repository.');
    let message = 'Snowlog vault passphrase';
    let dek = null;
    for (let i = 0; i < this.attempts && !dek; i++) {
      const secret = await this.askPassphrase(message);
      if (secret == null) throw new SessionError('cancelled', 'Unlock cancelled.');
      try {
        dek = await C.unlockVault(vaultFile, secret);
      } catch {
        message = 'Wrong passphrase. Type the Snowlog passphrase again';
      }
    }
    if (!dek) throw new SessionError('bad_secret', 'Wrong passphrase.');
    const vault = new Vault(this.repo, dek);
    await vault.loadIndex();
    this.vault = vault;
    this.freshAt = Date.now();
    this.lockedReason = null;
    this.touch();
    return vault;
  }

  lock(reason = 'manual') {
    this.vault = null; // the DEK and the decrypted notes are left without references
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

  // A vault ready to use: unlocks if needed and brings in what other devices changed.
  async open({ refresh = false } = {}) {
    if (!this.vault) {
      await this.unlock();
    } else if (refresh || Date.now() - this.freshAt > this.refreshMs) {
      try {
        await this.repo.fetchHead();
        await this.vault.loadIndex();
      } catch (e) {
        if (e.message === 'key_changed') {
          // The key was rotated from the app: the passphrase must be asked for again.
          this.lock('key_changed');
          await this.unlock();
        } else if (e instanceof TypeError) {
          throw new SessionError('offline', 'No connection to the notes repository.');
        } else throw e;
      }
      this.freshAt = Date.now();
    }
    this.touch();
    return this.vault;
  }

  // After writing: if Vault went offline, what was written is only in memory. It says so.
  assertSaved() {
    if (this.vault?.offline) {
      throw new SessionError('offline', 'Offline: the change was not uploaded. Try again with a connection.');
    }
  }

  settings() {
    return workspaceSettings(CONFIG.workspace, this.vault?.getSettings() || {}, this.vault?.index);
  }

  // Every note, decrypted and parsed (for search and for links).
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
