# 0003 — End-to-end encryption in the browser, with notes stored in a private GitHub repository

- **Status:** accepted (recorded afterwards, when the project adopted project-template 1.0.0)
- **Date:** 2026-11-09

## Context
The notes must be available on several devices, with history and copies, without a server of our own and without
anybody else (GitHub included) being able to read them.

## Options
| Option | Pros | Cons |
|---|---|---|
| A. Encrypt in the browser and commit ciphertext to a private repository through the GitHub API | No backend; git gives history, copies and multi-device sync; GitHub only sees ciphertext | Our own encryption design to get right; metadata (file count, sizes, times) is visible; one commit per save |
| B. A sync backend of our own | Full control, finer sync | A server to run and secure, which would hold the data |
| C. Plain Markdown in a private repository | Simplest | GitHub (or a leaked token) reads everything |

## Challenge
None at the time: the decision predates the template's challenge rule. The internal security review
([THREAT_MODEL.md](../THREAT_MODEL.md)) stands in for it until the independent review ([R-001](../RISKS.md)).

## Decision
Option A. A random AES-256-GCM data key (DEK) encrypts everything; it is wrapped twice in `.snowlog/vault.json`,
with the passphrase and with a recovery code (PBKDF2-SHA256, 600,000 iterations). Each file is
`base64(12-byte IV || ciphertext)` with its id as AAD, under a random name; paths and titles live only in the
encrypted index. The app's code and the notes are in separate repositories, so a stolen notes token cannot change
the site.

## Consequences
- Changing the passphrase or the recovery code only re-wraps the DEK; rotating the DEK re-encrypts everything in one
  commit and keeps old keys in `.snowlog/keyring.enc` to read the history.
- Conflicts between devices are detected by version and merged line by line; only clashing lines keep a copy.
- Replaying old versions is not detected yet ([R-002](../RISKS.md)); metadata stays visible on GitHub.
