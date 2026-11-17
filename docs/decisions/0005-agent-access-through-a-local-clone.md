# 0005 — Agent and script access through a local clone and an MCP server

- **Status:** accepted (recorded afterwards, when the project adopted project-template 1.0.0)
- **Date:** 2026-11-13

## Context
The owner wants assistants and scripts to read and write his notes as if they were a folder of Markdown, without
weakening the encryption or exposing the passphrase.

## Options
| Option | Pros | Cons |
|---|---|---|
| A. An MCP server in Node that reuses the app's modules over a local clone of the notes repository (git push) | Same encryption and merging as the app; works with any MCP client; nothing new on GitHub's side | The decrypted notes reach the MCP client while unlocked |
| B. A decrypted mirror folder kept in sync | Any tool can read it | Plaintext on disk, a sync process to keep right |
| C. Calling the GitHub API from the server with a token | No clone needed | Another token to manage; duplicates the app's client |

## Challenge
None at the time: the decision predates the template's challenge rule.

## Decision
Option A (`agent/`): `GitDirRepo` gives `Vault` the same interface as `GitHubRepo` over a clone; the DEK lives only
in the server's memory and is forgotten on lock or after 10 minutes unused; the passphrase is only typed by the owner
in a system dialog (or given by `SNOWLOG_ASKPASS`), never through the MCP client.

## Consequences
- Whoever uses the server while it is unlocked can read the whole vault ([R-007](../RISKS.md)).
- Never point it at the real notes unless the owner asks; `agent/test-vault.mjs` creates a test vault.
- Agent commits use the same messages as the app, with no titles or paths.
