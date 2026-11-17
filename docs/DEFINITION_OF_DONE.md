# Definition of Done (DoD)

A change is **done** only when it meets everything on this list. If something does not apply, say so in the PR with the reason.

Sections 1–6 are checked **before the PR** (by `/close-phase` and `/prepare-pr`, with the `dod-reviewer`). Section 7 can only be checked **after the merge**: the owner does it, and `/status` reminds of anything left.

```text
work + worklog → /close-phase (1–5) → /prepare-pr (1–6, three reviewers) → owner merges → section 7
```

## 1. Code
- [ ] Does what the issue and the phase file ask for, and nothing more (no unrequested side changes).
- [ ] Meets the acceptance criteria in the phase file.
- [ ] Readable: clear names, no dead code, no debug output (`print`, `console.log`…).
- [ ] Follows the project style (`docs/ARCHITECTURE.md` → Code conventions).
- [ ] No unnecessary new dependencies; any new ones are justified in the PR.

## 2. Tests
- [ ] Tested locally (see `docs/SETUP.md`) against the acceptance criteria.
- [ ] Automated tests added or updated for what changes.
- [ ] The *Verify* commands in `docs/SETUP.md` pass locally and CI is green.

## 3. Security
- [ ] `docs/THREAT_MODEL.md` exists before the first code that handles input, accounts, personal data, money or network exposure, and is updated if this change adds an entry point, an asset or a threat.
- [ ] No secrets, tokens, keys or personal data in the code or in the history; real values only in `.env` or a secret store.
- [ ] User input and external data are treated as untrusted and validated (type, length, format, allow-lists) before reaching queries, commands, paths, templates or HTML.
- [ ] Queries are parameterised; no shell command or `eval` is built from user input.
- [ ] Every request that reads or changes data checks **authorisation on the server**, for that user and that object (not only "is logged in").
- [ ] Passwords hashed with a modern algorithm (argon2id, scrypt or bcrypt), never stored or logged in clear; sessions and tokens expire and are revocable.
- [ ] Calls to external APIs use HTTPS, have timeouts and handle failures without crashing or leaking details.
- [ ] Errors shown to users reveal nothing internal; logs contain no secrets, tokens or personal data.
- [ ] New dependencies are justified, come from the official registry and are pinned in a lockfile.
- [ ] CI is green, including **SAST** (Semgrep) and **Dependencies** (OSV-Scanner); a silenced finding has a `nosemgrep` comment with its reason.
- [ ] Secret scanning reports nothing new.
- [ ] If the change touches authentication, external data, workflows or dependencies: reviewed with the `security-audit` skill (guidance mode).
- [ ] Before each major release: full audit with `security-audit`, with no open `confirmed` findings.
- [ ] Before each major release: `repo-security-posture` with no Critical or High findings.

## 4. Snowlog (web app, encrypted vault, portable and desktop)
- [ ] Accessible: real buttons, `aria-label` on icon-only ones, sufficient contrast, keyboard navigable.
- [ ] If the interface changes: tried on desktop and mobile, in light and dark themes, with no console errors.
- [ ] Note text reaches the page only through `markdown.js` (or `editor.js`/`query.js`), and every `innerHTML` through the `snowlog` Trusted Types policy.
- [ ] The CSP in `index.html` is not relaxed: no external scripts or styles (no CDN), no `unsafe-inline`/`unsafe-eval`; `connect-src` only GitHub and the configured Worker.
- [ ] Nothing in plaintext in the notes repository: content, titles, paths and credentials go through `crypto.js` (the vault and agent tests check it). A new file type is encrypted with its id as AAD.
- [ ] The key and the passphrase only in memory: never in `localStorage`, logs or errors.
- [ ] New tests for any change to `crypto.js`, `vault.js`, `localvault.js` or `markdown.js`.
- [ ] The portable file still builds with `connect-src 'none'` and hashes, and its e2e walkthrough passes (`npm run test:e2e`).
- [ ] Existing vaults keep working: stored data (folder names, settings files, query words) is read as before or migrated, with a test.
- [ ] The Worker keeps CORS limited to the configured origin and never returns the client secret (`worker.test.mjs`).

## 5. Documentation
- [ ] README updated if usage, configuration or data sources change.
- [ ] Entry in `docs/WORKLOG.md` (why, what was rejected, how it was tested, pending).
- [ ] `docs/STATE.md` updated (`/close-phase`). Full mode: phase file with *Result* filled in and the phase's user-visible changes in `CHANGELOG.md` → *Unreleased*.
- [ ] If a hard-to-reverse decision was made, it has its ADR in `docs/decisions/` (light mode: only irreversible ones).
- [ ] Public data sources used are cited with their license.

## 6. Integration (before the PR)
- [ ] Work on `development` (or a branch off it), never directly on `main`.
- [ ] Commits follow Conventional Commits with the correct author.
- [ ] `development` already contains everything in `main` (merged with `--no-ff` if not), so the checks run on what will be merged.
- [ ] Full mode: every phase in the PR is closed (✅ with its *Result*). Light mode: the plan is under *Recently done* in STATE.
- [ ] PR from `development` → `main` with [the PR template](../.github/pull_request_template.md) filled in, and the three reviewers passed.

## 7. After the merge (owner)
- [ ] The six CI checks were green on the merged PR.
- [ ] What is deployed (if anything) works.
- [ ] Issue closed and card moved to *Done* in GitHub Projects.
- [ ] `development` brought up to date with `main` (`git fetch` and `git merge --no-ff origin/main`) before the next piece of work.
