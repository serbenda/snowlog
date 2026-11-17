# 0004 — Distribution: the web app, a portable HTML file and a desktop app from the same code

- **Status:** accepted (recorded afterwards, when the project adopted project-template 1.0.0)
- **Date:** 2026-11-13

## Context
The owner also works on company computers, where installing programs may be forbidden and executables may be
flagged as viruses, and sometimes without a network. He asked for Snowlog to work without a web browser tab and
to be portable, on Linux, Windows and macOS.

## Options
| Option | Pros | Cons |
|---|---|---|
| A. One code base in three forms: the site, a single portable HTML file and a Tauri desktop app | The same features everywhere; the HTML file is not a program; the desktop app is small | Three builds to test; the desktop app is unsigned |
| B. Only the site (installable as a web app) | One build | Needs the site to be reachable once; no folder of plain files on Firefox or Safari |
| C. An Electron app | Same engine everywhere | Large, ships its own browser, more attack surface |

## Challenge
None at the time: the decision predates the template's challenge rule.

## Decision
Option A. The portable build bundles `public/` into one file with `connect-src 'none'` and hashed script and style,
and stores notes as plain `.md` files in a folder (or inside the browser). The desktop app (Tauri 2) loads `public/`
as is, exposes no commands to the page and is built by CI for Windows, macOS and Linux.

## Consequences
- The local and portable versions do not encrypt: notes are plain files protected by the computer account.
- Notes move between versions with an encrypted `.snowlog` backup or a `.zip`.
- The desktop executables are unsigned ([R-005](../RISKS.md)); the portable HTML file covers locked-down computers.
- In the desktop app, sign-in with the GitHub App does not work (its redirect goes to the published site): it uses a
  personal token.
