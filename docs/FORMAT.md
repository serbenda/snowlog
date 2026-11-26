# The vault format, version 1

Snowlog keeps a vault in a private GitHub repository (the "notes repository"). This page describes its files, so
that anyone can check what is stored and how, and it states the promise that keeps old vaults readable.

**Every vault made by an earlier version of Snowlog opens in every later version, with nothing lost** (see
[the promise](#the-compatibility-promise)). The tests open a vault made by each version that changed this code
(`tests/fixtures/vaults/`, checked by `tests/vault-compat.test.mjs`): they read every note and attachment, write to
the vault and recover it with its recovery code.

## Files in the repository

| Path | What it holds | Encrypted? |
|---|---|---|
| `.snowlog/vault.json` | The key parameters and the wrapped data key (below) | No: nothing in it is secret |
| `.snowlog/index.enc` | The index: every note's and attachment's path, dates and type, the folders, the settings | Yes (AAD `index`) |
| `n/<id>.enc` | One note's Markdown text | Yes (AAD: the note's id) |
| `a/<id>.enc` | One attachment's bytes (pictures, PDFs, drawings) | Yes (AAD: the attachment's id) |
| `.snowlog/keyring.enc` | The data keys used before each key rotation, to read the history | Yes (AAD `keyring`) |
| `.snowlog/library.enc` | The drawing editor's library | Yes (AAD `library`) |

`<id>` is 24 random hexadecimal characters: a file's name says nothing about the note. Titles, folder names and
attachment names exist only inside the encrypted index.

## Encryption

- **Cipher:** AES-256-GCM through the browser's Web Crypto. Each encryption uses a fresh random 12-byte IV, stored in
  front of the ciphertext. Files hold `base64(iv ‖ ciphertext ‖ tag)`.
- **AAD:** each kind of data has its own additional data (`index`, `keyring`, `library`, the note's or attachment's
  id). A file moved to another name, or one kind of file swapped for another, doesn't decrypt.
- **The data key (DEK):** 32 random bytes, made when the vault is created and changed by "Change the encryption
  key". It never leaves the device unwrapped, and it is imported as non-extractable.

## `vault.json`

```json
{ "app": "snowlog", "v": 1, "created": "…", "epoch": 2, "rotated": "…",
  "keys": { "passphrase": { "kdf": { … }, "wrapped": "…", "seal": "…" }, "recovery": { … } } }
```

| Field | Meaning |
|---|---|
| `app`, `v` | Always `"snowlog"` and `1`. |
| `created`, `rotated` | When the vault was created and when its key was last changed (ISO dates). |
| `epoch` | A hint of the vault's epoch, used only to pick a higher number. It is not trusted: the `seal` is. |
| `keys.passphrase`, `keys.recovery` | Two key slots: the DEK wrapped with a key derived from the passphrase, and the same DEK wrapped with a key derived from the recovery code. |
| `kdf` | `{ "name": "PBKDF2", "hash": "SHA-256", "iterations", "salt" }`. The salt is 16 random bytes. `iterations` must be between 600,000 and 10,000,000, or the vault is refused. |
| `wrapped` | The DEK encrypted with the slot's derived key (AAD `dek`). |
| `seal` | The vault's epoch encrypted with the slot's derived key (AAD `epoch`). Every change of key or passphrase raises it. A device refuses a `vault.json` with a lower epoch than the highest it has opened. Slots without a seal (vaults made before 2026-11-26) count as epoch 0 and get one on their next change. |

## The index (`index.enc`, decrypted)

```json
{ "v": 1, "notes": { "<id>": { "path", "created", "updated", "rev" } },
  "files": { "<id>": { "path", "type", "size", "created", "rev" } },
  "folders": ["Projects", "Projects/Ideas"], "settings": { … }, "hasLibrary": true, "hasKeyring": true }
```

`rev` changes with every save; together with `updated` it tells devices apart when two of them save at the same
moment. `type` is the attachment's media type, from an allowlist (PNG, JPEG, GIF, WebP, AVIF, BMP, PDF and bsketch drawings; up to 20 MB each): never SVG or HTML.

## Local folders (no encryption)

The portable file and the desktop app can also open an ordinary folder ("Open a folder"). There the notes are
plain `.md` files, attachments keep their own names, and settings live in `.snowlog/settings.json`
(`.snowlog/ajustes.json` in folders made before the English translation is still read). That is a separate format
on purpose: any Markdown editor can open it. Moving between the two goes through a backup (`.zip`).

## On the device

The same files are kept in the browser (IndexedDB `snowlog-cache`), still encrypted. A copy of `vault.json`, the
GitHub credentials (encrypted with the DEK) and the highest epoch opened are kept in `localStorage`. See
[THREAT_MODEL.md](THREAT_MODEL.md) → What stays on the device.

## The compatibility promise

1. **Every vault made by any earlier version opens** in every later version: every note, attachment, setting and the
   history of earlier keys.
2. **The format only grows by optional fields** whose absence means what it means today, like `epoch` and `seal` did.
   No field is renamed or removed, and no value changes meaning.
3. A change that can't follow rule 2 would be **version 2**: Snowlog would migrate a vault to it only after asking,
   and keep reading version 1.
4. An **older** version of the app ignores what it doesn't know.
5. Every release that changes the vault code adds a vault made by it to `tests/fixtures/vaults/`
   (`node scripts/make-vault-fixtures.mjs`). No release ships if one of those vaults stops opening.
