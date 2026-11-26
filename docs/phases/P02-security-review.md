# P02 — Independent security review, and tests on real devices

- **Stage:** S3
- **Status:** ⏳ in progress
- **Issue:** —
- **Dates:** 2026-11-26 → —
- **Owner approvals:** 2026-11-26 "empieza tú"

## Goal
Snowlog's first release ships with no known High security finding ([R-001](../RISKS.md)) and is known to work on the
browsers and devices people use ([R-004](../RISKS.md)).

## Scope
**In:**
- **The agent:** an independent review of the code by a sub-agent that hasn't seen the earlier work: the encryption
  (keys, AES-GCM, AAD, rotation), sign-in and the Worker, storage, rendering (Markdown, links, attachments, the embedded
  editor), the service worker and CSP, the portable file, the desktop app and the agent access (MCP). Every finding is
  checked with a script, fixed and covered by a test, or recorded as a risk when it is the owner's decision. Also:
  axe-core, a performance check with a big vault, and fuzzing of the parsers.
- **The owner:** the portable file on real Firefox and Safari; the app on real phones, macOS and Windows.

**Out:**
- A paid external audit (the owner's decision); new features.

## Acceptance criteria
- [x] Every security finding fixed with a test, or recorded as a risk with the owner's decision.
- [x] No High finding open; R-001 updated.
- [x] axe-core: no violation on the sign-in screen and the portable file, light and dark (the unlocked app needs a
  vault: checked by the owner with P02's device tests).
- [x] `npm test` and `npm run test:e2e` pass.
- [ ] The owner's tests on real devices (R-004).

## Security impact
- Lowers it: findings fixed; what can't be fixed is written down.

## Findings and what was done
| # | Severity | Finding | Fix | Test |
|---|---|---|---|---|
| F1 | High | `vault.json` wasn't checked: a repository writer could set the passphrase slot to 1 PBKDF2 iteration; the app then took it for a passphrase change elsewhere, and recovering with the code copied that count into the new slot (crackable at once). `2**31` iterations hung unlocking | Iterations must be within 600,000–10,000,000 before anything is derived (`KDF_LIMITS`); recovery refuses a malformed slot and never uses fewer than the floor | `crypto.test.mjs` "vault.json can't make the PBKDF2 work cheaper or endless"; the reviewer's script now fails with `bad_vault` |
| F2 | Medium | Putting back the `vault.json` from before a key rotation made devices switch silently to the old (possibly leaked) key | Sealed epochs: each slot carries the epoch encrypted with its own key, raised by every key or passphrase change; the device remembers the highest one opened (`snowlog.epoch`) and refuses a lower one, or the same one with another key; key changes refuse a `vault.json` that changed since this device opened it. Old vaults open as epoch 0 and get a seal on their next change; older app versions ignore the new field | `crypto.test.mjs` "epochs: …" and "vaults made before epochs …" |
| F3 | Medium | A line like "```js title", "````" or "```{r}" (common in imports) made the Markdown renderer loop until the tab ran out of memory | One rule for opening a fence and for ending a paragraph; every turn uses up a line | `markdown.test.mjs` "fences … never hang" |
| F4 | Low | A note whose encrypted file was deleted in the repository read as an empty note | `missing_note` error | `vault.test.mjs` |
| F5 | Low | Auto-lock waited without limit for a save on a stalled connection, keeping the key in memory | At most 15 s; then the text waits encrypted in the outbox | Code review (`lock()`) |
| F6 | Low | After an XSS, `connect-src https://api.github.com` would still let script write to the attacker's own repository | Documented in the threat model (CSP can't limit paths); no XSS found (150,000-case renderer fuzz) | — |
| F7 | Low | Portable "Store inside the browser" uses the `file://` storage, which some browsers share between every local HTML file | Warned in PORTABLE.md; R-009, to check on real Firefox and Safari | — (owner, R-004) |
| F8 | Info | A note read by an agent could steer it to overwrite notes; a looping agent kept the vault unlocked for ever | MCP tool annotations (`readOnlyHint`, `destructiveHint`); the vault locks 8 h after unlocking | `agent.test.mjs` |
| F9 | Info | The service worker kept any same-origin page as the offline shell; commit messages and exact sizes reveal some metadata; note and attachment AADs share a namespace | The offline shell is only the app's own page (cache `snowlog-v8`); the rest accepted and recorded (sizes and commit kinds aren't secret in the threat model; ids are random) | Code review (`sw.js`) |

Also: axe-core found the sign-in screen outside any landmark; the card is now the page's `main`.

---

## Result (the agent's part)
- **What was done:** the table above.
- **How it was tested:** `npm test` 172 pass; `npm run test:e2e` 5 pass; the reviewer's proof scripts re-run (the
  downgrade is refused, the renderer no longer hangs); axe-core on the sign-in screen and the portable file.
- **What is left:** the owner's tests on real devices (R-004, R-009), then P02 closes.
- **Lessons learned:** anything read from the repository before unlocking (`vault.json`) is attacker-controlled
  input like any file; parameters that set the cost of a key must be bounded on read, not trusted.
