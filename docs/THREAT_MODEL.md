# Threat model

> What we protect, from whom, where the attacks come in and what stops them. It is written **before the first
> code** that handles user input, accounts, personal data, money or anything reachable from the network, and
> reviewed in every phase that touches one of those. `security-reviewer` checks each change against it.
> Keep it short and concrete: a threat without a control is a risk and also goes in [RISKS.md](RISKS.md).

Last reviewed: 2026-11-17 (first written as an internal review on 2026-11-13; an independent review is still due,
[R-001](RISKS.md))

## What we protect (assets)
| Asset | Why it matters | Sensitive? |
|---|---|---|
| Note content, titles, folder names, attachments and drawings | The owner's private notes | Yes |
| The data key (DEK) and the passphrase | Whoever has them reads everything | Yes |
| The recovery code | Can set a new passphrase | Yes |
| GitHub credentials (OAuth token or personal token) | Write access to the notes repository | Yes |
| The GitHub App client secret | Lets anyone complete the sign-in as the app | Yes (only in the Worker) |
| Integrity of the code that is served | Malicious code would see the decrypted notes | Yes |

## Who could attack (actors)
- Someone who can read the notes repository: a leak, a stolen token, GitHub itself.
- Someone with **write** access to the notes repository.
- Someone with the computer or the phone, without the passphrase.
- A malicious page that frames Snowlog, or a note with hostile content (imported, pasted, from a backup).
- A compromised dependency, CI or AI agent (prompt injection through notes, issues, web pages or files); the MCP
  server returns decrypted notes to its client while unlocked.

## Where attacks come in (entry points and trust boundaries)
| Entry point | Who can reach it | Data it receives | Authenticated? |
|---|---|---|---|
| Notes repository files (`vault.json`, `index.enc`, `n/`, `a/`, `keyring.enc`) | Anyone with access to the repository | Ciphertext and the wrapped keys | GitHub token; content authenticated by AES-GCM with the id as AAD |
| Note text and imports (folder import, `.snowlog`/`.zip` backups, `.excalidraw`/`.sketch`) | The owner, or whoever wrote the file | Markdown, JSON, images, PDFs | No (treated as untrusted) |
| OAuth redirect (`?code=…&state=…`) | Anyone who sends a link | A code and a state | `state` checked against `sessionStorage` |
| The Worker (`/token`, `/refresh`) | The internet | A code or a refresh token | Only the configured origin (CORS) |
| GitHub API responses | GitHub | JSON | HTTPS |
| MCP server (stdio) | The local MCP client | Tool calls | Local process; the passphrase only through a system dialog |

## Threats and controls
| Threat | Entry point | Control | How it is checked |
|---|---|---|---|
| Reading notes from the repository | Repository files | AES-256-GCM with a random DEK; random file names; paths and titles only inside the encrypted index | `vault.test.mjs` and `agent.test.mjs` ("nothing in plaintext"), e2e |
| Moving content from one file to another | Repository files | The file id is the AAD: a moved file does not decrypt | `crypto.test.mjs` |
| Brute-forcing the passphrase from `vault.json` | `vault.json` on the device or in the repository | PBKDF2-SHA256, 600,000 iterations; recovery code of 125 bits. A slot's iterations must be within 600,000–10,000,000 before anything is derived, so a changed `vault.json` can't make a new passphrase cheap (recovery never copies fewer) nor make unlocking hang (P02, F1) | `crypto.test.mjs` "vault.json can't make the PBKDF2 work cheaper or endless" |
| A stolen device reveals notes or tokens | Device storage | Everything stored is encrypted with the DEK; open folder names encrypted; the DEK only in memory; lock after 10 minutes | Review of what stays on the device (below) |
| XSS from note content | Note text, imports | `markdown.js` escapes before formatting; CSP without `unsafe-inline`/`unsafe-eval`; Trusted Types policy `snowlog`; only `http(s)`, `mailto` and anchors | `markdown.test.mjs`, `csp.test.mjs`, e2e "safe reading" |
| Executable attachments | Attachments | Only images and PDFs (no SVG or HTML); images as `data:`, PDFs as `blob:` with `application/pdf` | `vault.test.mjs` (`bad_type`) |
| Exfiltration after an XSS | CSP | `connect-src` only GitHub and the configured Worker (no wildcards); portable `connect-src 'none'`. Limit: CSP can't restrict by path, so injected script could still write to the attacker's own repository or gist through `api.github.com`; what stops it is that no XSS reaches the page (escaping, Trusted Types; a 150,000-case fuzz of the renderer in P02 found none) | `csp.test.mjs`, `build.test.mjs` |
| A hostile or ordinary note freezes the reader | Note text, imports | Every line that starts a code fence is taken by the same rule; every turn of the renderer uses up at least one line (P02, F3) | `markdown.test.mjs` "fences … never hang" |
| A note's file deleted in the repository looks like an empty note | Repository files | A note the index lists without its file is an error (`missing_note`), not empty text (P02, F4) | `vault.test.mjs` |
| A stalled save keeps the key in memory after the auto-lock | Network | Locking waits at most 15 s for a save in progress; the text then waits encrypted in the outbox (P02, F5) | Code review (`lock()` in `app.js`) |
| An agent steered by a note it reads (prompt injection) changes notes | MCP server | Tool annotations (`readOnlyHint`, `destructiveHint` on `write_note`) so clients ask before writing; git history to undo; no delete or rename tools; the vault locks 8 hours after unlocking however busy the agent keeps it (P02, F8) | `agent.test.mjs` |
| Clickjacking | Framing | Snowlog does not start inside an iframe (GitHub Pages cannot send `frame-ancestors`) | Code review (`boot()` in `app.js`) |
| A passphrase changed or key rotated elsewhere keeps the old one valid here | `vault.json` cached | On unlock the cached `vault.json` is compared with the repository's; rotation makes other devices ask again | `vault.test.mjs`, e2e "rotating the key" |
| An earlier `vault.json` put back in the repository (after a rotation or a passphrase change) | Repository files | Each key slot carries a seal: the vault's epoch encrypted with that slot's key, raised by every key or passphrase change. The device remembers the highest epoch it has opened and refuses a lower one (or the same one with another key); key changes refuse a `vault.json` that changed since this device opened it (P02, F2) | `crypto.test.mjs` "epochs: …" |
| A known passphrase or key keeps opening new notes | Key compromise | "Change the encryption key" re-encrypts everything with a new DEK and renews the recovery code | `vault.test.mjs`, e2e |
| Leaked secrets | Code, history | No secrets in the code; the client secret only as a Worker secret | Gitleaks pre-commit and CI |
| Vulnerable dependency | Supply chain | No runtime dependencies; actions pinned to a SHA; Dependabot with cooldown | Dependencies job (OSV), Dependabot |
| The MCP client learns the passphrase | MCP server | The passphrase only via a system dialog (or `SNOWLOG_ASKPASS`), never in arguments, environment, files or errors | `agent.test.mjs` |

## What stays on the device
| Where | What | In plaintext? |
| --- | --- | --- |
| `localStorage` | `vault.json` (wrapped keys, salts), encrypted GitHub credentials, last note id, encrypted open folders, last backup date, open panels | Only non-sensitive data; folder names and tokens are encrypted |
| IndexedDB `snowlog-cache` | Notes, attachments, index and pending changes, as in the repository | No: all encrypted with the DEK |
| Service worker cache | The web app itself (HTML, CSS, JS, icon) | Yes, but no data |
| `sessionStorage` | The sign-in `state`, while it lasts | Not secret |
| Memory | DEK, decrypted notes | Wiped on lock |

On lock (by hand or after 10 minutes) the editor, reading view, highlighting, tree, outline, backlinks, search,
tags, notices, open dialogs, breadcrumbs, the tab title and the attachments' `blob:` URLs are emptied.

## Findings of the internal review (2026-11-13)
| # | Finding | Severity | State |
| --- | --- | --- | --- |
| 1 | `connect-src` allowed any `*.workers.dev`: an XSS could send data to another Worker | Medium | Fixed: only the configured Worker (tested) |
| 2 | No protection against iframes | Medium | Fixed: it does not start inside an iframe |
| 3 | On lock, the note name stayed in the tab title and breadcrumbs, and open dialogs stayed | Medium | Fixed: emptied on lock |
| 4 | Open folder names were stored in plaintext in `localStorage` | Low | Fixed: encrypted with the DEK (in plaintext locally, like the files) |
| 5 | No Trusted Types: a careless new `innerHTML` could open an XSS | Low | Fixed: CSP with Trusted Types and a test |
| 6 | Notices could show note names after locking | Low | Fixed: emptied on lock |
| 7 | After a passphrase change on another device, the old one still worked here | Medium | Fixed: compared with the repository on unlock |
| 8 | No way to make a possibly known key useless | Medium | Fixed: DEK rotation from the app |

## Out of scope
- **Replaying old versions:** someone who can write to the repository could put back an older encrypted version of a
  note or the index. They cannot read it or forge new content. Detecting it needs a signed index with a counter
  ([R-002](RISKS.md)).
- **Old versions after a key rotation:** they stay in git history encrypted with the old key; whoever has the old
  passphrase and repository access could read those (not new ones). Removing them means rewriting the repository
  history, outside the app.
- **Sign-in without PKCE:** uses `state` but not PKCE; low severity because the code only works with the client
  secret, which stays in the Worker ([R-003](RISKS.md)).
- **Metadata visible on GitHub:** number of files, approximate sizes and commit times.
- **A compromised browser or extensions with access to the page:** they can read what is on screen.
- **The portable and local versions do not encrypt:** notes are plain `.md` files protected by the computer account,
  by design (see [PORTABLE.md](PORTABLE.md)).
