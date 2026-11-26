# Worklog

> The **context** of each change: what, why, what was rejected, commits, how it was tested and what is pending.
> Maintained by the agent with the `record-changes` skill. New entries **on top**.
> In full mode, user-visible changes go once per phase in [CHANGELOG.md](../CHANGELOG.md); the current status is in [STATE.md](STATE.md).

<!--
## YYYY-MM-DD — Short title of the change
- **Phase / issue:** P03 · #12 (or "—")
- **What:**
- **Why:**
- **Rejected:**
- **Files:**
- **Commits:**
- **Tested:**
- **Pending:**
-->

## 2026-11-26 — P05: the vault format written down and tested
- **Phase / issue:** P05
- **What:** `docs/FORMAT.md`; `scripts/make-vault-fixtures.mjs` makes `tests/fixtures/vaults/<version>.json` with
  each version's own code (temporary worktrees of PRs #1, #4, #5, #6, #7, #9, #16); `tests/vault-compat.test.mjs`
  opens, reads, writes and recovers each, and checks FORMAT.md documents every field; `seed()` in the fake GitHub;
  ADR 0008.
- **Why:** bsketch's format freeze (its P27) applied to Snowlog, where losing access to notes is worse.
- **Rejected:** hand-made fixtures (not what each version wrote); a version 2 format before the first release.
- **Files:** docs/FORMAT.md, scripts/make-vault-fixtures.mjs, tests/vault-compat.test.mjs, tests/fixtures/vaults/*,
  tests/fake-github.mjs, docs/phases/P05-vault-format.md, docs/decisions/*, docs/ROADMAP.md, docs/STATE.md,
  CHANGELOG.md
- **Commits:** this one.
- **Tested:** `npm test` passes.
- **Pending:** —

## 2026-11-26 — P02: independent security review, findings fixed (agent part)
- **Phase / issue:** P02
- **What:** an independent review (a read-only sub-agent) found 1 High, 2 Medium, 4 Low and 2 Info; fixed: PBKDF2
  iteration limits and sealed epochs in `public/js/crypto.js` (`KDF_LIMITS`, `openVault`, `epochHint`, slot `seal`),
  the device's highest epoch (`auth.js`), rollback checks and `currentVaultFile()` in `app.js`; the fence loop in
  `markdown.js`; `missing_note` in `vault.js`; a bounded wait in `lock()`; MCP annotations and a maximum unlocked
  time (`agent/`); the offline shell limited to the app page (`sw.js`, `snowlog-v8`); the sign-in card as `main`.
  Threat model, R-001 (MITIGATED), R-002, new R-009, PORTABLE.md, CHANGELOG.
- **Why:** S3's exit criterion (no High findings open) before the first release.
- **Rejected:** a MAC over `vault.json` with a key from the DEK (an attacker holding an old DEK could forge it; the
  seal under each slot's own key can't be forged without the secret); prefixing AADs by type (a format change for no
  practical gain: ids are random).
- **Files:** public/js/crypto.js, public/js/auth.js, public/js/app.js, public/js/markdown.js, public/js/vault.js,
  public/sw.js, public/index.html, agent/mcp.js, agent/session.js, tests/*.mjs, docs/*, CHANGELOG.md
- **Commits:** this one.
- **Tested:** `npm test` 172 pass (twice); `npm run test:e2e` 5 pass; the reviewer's scripts; axe-core.
- **Pending:** the owner's tests on real devices (R-004, R-009).

## 2026-11-26 — License: all rights reserved, no use by AI; P01 closed in the docs
- **Phase / issue:** P01 (closed), ADR 0007
- **What:** `LICENSE` (bsketch's proprietary license adapted to Snowlog); the notice with the marker
  `snowlog-b50d2624` at the top of 62 source files (JS, CSS, Rust; after the shebang where there is one; not the
  editor copied from bsketch, which keeps bsketch's); `noai, noimageai` robots meta and a notice in
  `public/index.html`; `"license": "UNLICENSED"`, `license-file` in `Cargo.toml` and the copyright in
  `tauri.conf.json`; README, CHANGELOG. P01 marked done (PR #6 merged on 2026-11-17) and STATE brought up to date.
- **Why:** the owner's decision for bsketch (its ADR 0006) applied to Snowlog, which embeds its editor; STATE still
  said "waiting for PR #6".
- **Rejected:** a private repository (Actions and Pages would cost money).
- **Files:** LICENSE, README.md, CHANGELOG.md, package.json, desktop/src-tauri/Cargo.toml,
  desktop/src-tauri/tauri.conf.json, public/index.html, public/js/*.js, public/css/*.css, public/sw.js, worker/src/*,
  agent/*, scripts/*.mjs, tests/*, desktop/*, docs/*
- **Commits:** this one.
- **Tested:** `npm test` 166 pass; `npm run test:e2e` pass; the portable build carries the notices.
- **Pending:** the owner: `./scripts/setup-repo.sh` (no ruleset on `main` yet).

## 2026-11-26 — Pages: build and deploy in separate jobs
- **Phase / issue:** —
- **What:** `.github/workflows/pages.yml` has a `build` job (checkout, the site, the portable file, the Pages artifact)
  and a `publish` job (`needs: build`) that only deploys; the `github-pages` environment is on the deploy job only.
- **Why:** "Publish to GitHub Pages" failed on `main` with "No artifacts named github-pages": in one job the deploy
  listed the run's artifacts about 0.1 s after the upload and found none (eventual consistency); reruns failed the
  same way. Two jobs is GitHub's own pattern and gives the artifact time to be listed.
- **Rejected:** a `sleep` before the deploy (still a race, only less likely).
- **Files:** .github/workflows/pages.yml, docs/WORKLOG.md
- **Commits:** this one (a guardrail file: committed by the owner with `GUARDRAILS_OWNER_CHANGE=1`).
- **Tested:** actionlint-style review of the YAML; the next push to `main` runs it.
- **Pending:** —

## 2026-11-26 — Dev container: Claude Code pinned by a lockfile
- **Phase / issue:** —
- **What:** `.devcontainer/claude-code/package.json` and `package-lock.json` (Claude Code 2.1.319 and its platform
  packages, each with its integrity hash); the Dockerfile installs them with `npm ci` into `/opt/claude-code` and
  links `claude` into `/usr/local/bin`, instead of `npm install -g` by version; Dependabot gets an npm entry for that
  folder (weekly, 7-day cooldown); SECURITY_GUIDE updated.
- **Why:** Scorecard's Pinned-Dependencies flagged the `npm install -g` (only the top package's version was fixed;
  nothing checked what was downloaded).
- **Rejected:** Claude Code's native installer (a script from the network, harder to pin); leaving the alert.
- **Files:** .devcontainer/Dockerfile, .devcontainer/claude-code/package.json, .devcontainer/claude-code/package-lock.json,
  .github/dependabot.yml, docs/SECURITY_GUIDE.md, docs/WORKLOG.md
- **Commits:** this one (guardrail files: committed by the owner with `GUARDRAILS_OWNER_CHANGE=1`).
- **Tested:** the lockfile resolves 2.1.319 with glibc and musl variants told apart (`libc`), so `npm ci` on Ubuntu
  installs the glibc one; OSV has no advisory for 2.1.319. The image is built by the `Devcontainer` workflow on the PR.
- **Pending:** —

## 2026-11-24 — bsketch's engine after its pre-2.0 audits
- **Phase / issue:** — (bsketch P25)
- **What:** `scripts/update-sketch.mjs` copied bsketch `main` (`0a573ca`: 1.5.0 plus P25's fixes) into
  `public/js/sketch-*.js` and `public/css/sketch.css`; cache `snowlog-v7`.
- **Why:** P25 fixed denial-of-service issues with hostile drawings (a hachure budget, elbow routing with a budget, a
  slide cap, libraries sharing pictures, linear-time text to diagram) and malformed SVG exports; Snowlog opens
  drawings from vaults, so it needs the same fixes.
- **Rejected:** waiting for bsketch 2.0.0 (the fixes are already on bsketch's `main` and released to its site).
- **Files:** public/js/sketch-*.js, public/css/sketch.css, public/sw.js, CHANGELOG.md, docs/WORKLOG.md
- **Commits:** this one.
- **Tested:** `npm test` 166 pass; `npm run test:e2e` 5 pass (Chrome). The editor's API is unchanged since 1.3.
- **Pending:** —

## 2026-11-20 — The drawing library and templates
- **Phase / issue:** — (bsketch P18)
- **What:** `readLibrary`/`saveLibrary` in both vaults: in a GitHub vault an encrypted `.snowlog/library.enc` (AAD
  `library`), flagged in the index as `hasLibrary` so a vault without one asks for nothing, and encrypted again by
  `rotate`; in a folder a plain `.snowlog/library.bsketchlib`. The editor gets them as its `library` (and `onNotice`).
  `templates.js` copied from bsketch; the command palette lists "New drawing from a template: …" for each; cache
  `snowlog-v6`.
- **Why:** bsketch's S6 (P18): the editor's library and templates were hidden in Snowlog for lack of a place to keep
  them.
- **Rejected:** keeping the library in the index's settings (it can hold pictures: megabytes in every index read);
  a visible attachment (it would show in the file tree and search).
- **Files:** public/js/vault.js, public/js/localvault.js, public/js/app.js, public/js/sketch-templates.js,
  scripts/update-sketch.mjs, public/sw.js, tests/vault.test.mjs, tests/localvault.test.mjs, CHANGELOG.md
- **Commits:** this one.
- **Tested:** `npm test` 166 pass (encrypted in the repository, read from another device, survives key rotation, the
  folder's plain file); `npm run test:e2e` 5 pass; the portable build; in Chrome a template drawing, a piece kept in
  the library, and the library read back after locking and unlocking (`library.enc` holds no plaintext).
- **Pending:** —

## 2026-11-20 — bsketch 1.3's engine; saves in the same millisecond no longer clash
- **Phase / issue:** — (bsketch P17)
- **What:** the drawing engine copied from bsketch `v1.3.0` (`fe1613f`): frame clipping, presentation mode, arrows
  bent by hand; the e2e driver starts Chrome like bsketch's (`--disable-dev-shm-usage`, 45 s, three tries, nothing
  left running); the service worker's cache `snowlog-v5`. **Fix:** notes and attachments are versioned by
  `verOf` = date + a random `rev` set on every save, instead of the date alone.
- **Why:** the engine update was planned (bsketch's S6). The fix came from "drawings: changes from two devices…",
  which started failing on a fast machine: two saves in the same millisecond had the same version, so the second
  device didn't notice the first one's change and overwrote it.
- **Rejected:** a counter (two devices can't agree on the next number without the server); `rev` alone (the MCP
  server or older versions that only set the date would go unnoticed).
- **Files:** public/js/sketch-*.js, public/css/sketch.css, public/sw.js, public/js/vault.js, tests/e2e/cdp.mjs,
  tests/vault.test.mjs, CHANGELOG.md
- **Commits:** this one.
- **Tested:** `npm test` 164 pass (a new test pins the clock so every save shares one millisecond: it fails without
  the fix); `npm run test:e2e` 5 pass; the portable build; a drawing pasted from Mermaid saves encrypted and opens again.
- **Pending:** —

## 2026-11-20 — The drawing engine from bsketch, with text to diagram
- **Phase / issue:** —
- **What:** `scripts/update-sketch.mjs` also copies `textdiagram.js` (the editor imports it now); the engine copy
  refreshed from bsketch `59f9453` (pictures, frames, text to diagram, Ctrl+arrow chaining, animated arrows,
  clipboard between tabs); `sketch-textdiagram.js` added to the service worker's files and its cache bumped to
  `snowlog-v4`.
- **Why:** bsketch's 1.2.0 work, inside Snowlog's encrypted notes.
- **Rejected:** bsketch's library and templates (they need a place to keep them that Snowlog doesn't give the editor
  yet; the editor hides them without one).
- **Files:** scripts/update-sketch.mjs, public/js/sketch-*.js, public/css/sketch.css, public/sw.js, CHANGELOG.md
- **Commits:** this one.
- **Tested:** `npm test` 163 pass; `npm run test:e2e` 5 pass; the portable build; a Mermaid diagram pasted on a
  drawing in Chrome is drawn, saved encrypted and opens again after locking and unlocking.
- **Pending:** —

## 2026-11-19 — The drawing engine from bsketch
- **Phase / issue:** —
- **What:** `scripts/update-sketch.mjs` and the docs point at `serbenda/bsketch` (the sketch repository was renamed);
  the engine copy (`public/js/sketch-*.js`, `public/css/sketch.css`) refreshed from bsketch `3ec8fd5`; the service
  worker's cache bumped to `snowlog-v3` so installed copies get the new engine.
- **Why:** the copy was several bsketch releases behind and the script named the old repository.
- **Rejected:** copying bsketch's `drawings.js` and `i18n.js` (Snowlog keeps its own drawings in the vault and its
  interface is in English, so the editor's default text fits).
- **Files:** scripts/update-sketch.mjs, public/js/sketch-*.js, public/css/sketch.css, public/sw.js, public/js/app.js,
  public/js/vault.js, README.md, AGENTS.md, docs/ARCHITECTURE.md, CHANGELOG.md
- **Commits:** this one.
- **Tested:** `npm test` 163 pass; `npm run test:e2e` 5 pass.
- **Pending:** drawings inside Snowlog not checked by eye with the new engine.

## 2026-11-17 — Adopt project-template 1.0.0; everything in English
- **Phase / issue:** P01 · PR #6
- **What:**
  - The interface, error messages, comments, tests, the starter space, templates, the example project, the MCP
    server's tool descriptions, the Worker, the desktop app and the build scripts translated to English. New vaults get
    `Home`, `Daily`, `Templates`, `Attachments` and `Drawings`; template dates are written in English; sorting uses
    the English collation.
  - Existing data keeps working: `workspaceSettings` (templates.js) keeps the earlier Spanish folder names when the
    vault already uses them and Settings has not chosen others; local folders write `.snowlog/settings.json` and still
    read `.snowlog/ajustes.json`; queries still accept `date(hoy|mañana|ayer)`.
  - The drawing engine copied again from sketch `d868eaa` with its English file names (`sketch-stroke`,
    `sketch-scene`, `sketch-render`); `scripts/update-sketch.mjs` updated; the service worker cache version raised so
    installed copies pick up the renamed files. `desktop/prueba.mjs` is now `desktop/smoke-test.mjs`.
  - The template's docs filled in from the old ones: VISION, STATE, ROADMAP (S0–S2 done, S3 in progress),
    ARCHITECTURE (from CONTEXT), THREAT_MODEL (from SEGURIDAD), RISKS, SETUP and DEPLOYMENT (from PUESTA-EN-MARCHA),
    DEFINITION_OF_DONE (template plus Snowlog's own block), AGENT_ACCESS (from AGENTES), PORTABLE (from PORTATIL),
    ADRs 0002–0006 and phase P01. README, CHANGELOG and SECURITY in English; `.gitignore` from the template plus the
    Worker's and the desktop build's files; `.claude/launch.json` for the local server.
  - `agent/gitdir.js`: writing to git's stdin no longer crashes the process with EPIPE when git exits before reading
    it (the agent tests failed now and then).
  - The guardrails prepared as one patch and rehearsed on a copy: the template's owned files (sync `--apply`),
    settings (template plus `npm test`, `npm run test:e2e`, `npm run build:portable` allowed and `.dev.vars` denied),
    `ci.yml` (template jobs plus a Tests job with the unit tests, the e2e and the portable artifact; the old
    `test.yml` and its authorship check removed), Dependabot with `cargo`, `AGENTS.md` (template plus Snowlog's
    security rules), `CLAUDE.md`, `setup-repo.sh`, CODEOWNERS, `.github/OWNER`, the dev container, the template's
    skills, and `pages.yml` and `desktop.yml` in English with actions pinned to a SHA. The old Spanish commands removed.
  - First CI run: every job green except SAST. Semgrep flags the plain-HTTP `fetch` to `tauri-driver` on
    `127.0.0.1:4444` in `desktop/smoke-test.mjs` (`react-insecure-request`); it shows up now because SAST had never
    run on this code. Both requests now go through one `driver()` function, so a single line is left to suppress;
    the `nosemgrep` with its reason was committed by the agent with `GUARDRAILS_OWNER_CHANGE=1` at the owner's
    explicit request in chat (`3ae6626`); CI is green on every job. Also translated a few strings and comments the first
    pass missed (`mcp.js`, `session.js`, `kvdir.js`, `backup.js`, `markdown.js`, `links.js`, `cdp.mjs`) and the
    remaining Spanish test data (`editor.test.mjs`, `import.test.mjs`).
- **Why:** the owner asked for both projects to use the template and for everything to be in English
  ([ADR 0006](decisions/0006-adopt-project-template-in-english.md)).
- **Rejected:** renaming the folders inside existing vaults (it would rewrite the owner's notes and links; the legacy
  names are data, kept by detection instead); a one-time migration of `ajustes.json` (reading both is simpler and
  loses nothing); keeping Spanish with an ADR (the template's records, commands and PR template are English).
- **Files:** public/*, agent/*, worker/*, desktop/*, scripts/build-portable.mjs, scripts/update-sketch.mjs, tests/*,
  package.json, README.md, CHANGELOG.md, SECURITY.md, .gitignore, .claude/launch.json, docs/*
- **Commits:** 0146141 (EPIPE fix), 307a62d (code, interface and tests), f37566d and 2921d80 (docs), 014aacd
  (guardrails, applied, committed and pushed by the agent with `GUARDRAILS_OWNER_CHANGE=1` at the owner's explicit
  request in chat for this patch), the smoke-test and translation fix, and this record's updates.
- **Tested:** `npm test` 163 pass (new: legacy names, legacy settings file, Spanish query words); `npm run test:e2e`
  5 pass in Chrome; the portable build opened in Chrome with the starter space and the examples loaded, checking that
  the tree, the note menu and the command palette show no Spanish text and the console has no errors. On the
  rehearsal copy with the guardrails: shellcheck, `test-guard.sh`, `test-check-records.sh`, `test-githooks.sh`,
  actionlint, `check-records.sh origin/main HEAD` and `npm test` pass (`test-scripts.sh` is skipped in projects, as
  in CI). Smoke test: run against a fake WebDriver server on 127.0.0.1:4444 (session, script and
  delete calls answered).
- **Pending:** the owner's review of the guardrail files on PR #6; `setup-repo.sh` for the rules of `main`;
  PR #6's title and description in English.

## 2026-11-13 — Recorded afterwards: the work before the template (S0–S2)
- **Phase / issue:** — (PRs #1 to #6)
- **What:** the encrypted core and the sign-in, the day-to-day features (daily note, templates, queries, calendar,
  backlinks), the editor, search, attachments, conflict merging, history, backups, offline use, settings, palette,
  Kanban, graph, drawings, the portable file, the desktop builds and agent access. Details in the CHANGELOG.
- **Why:** to keep the worklog's history continuous from the day the project adopted the template.
- **Rejected:** writing phase files after the fact (they would be invented history).
- **Files:** see the PRs.
- **Commits:** see the PRs.
- **Tested:** unit tests and Chrome walkthroughs in CI on every PR; desktop builds with a WebDriver smoke test on Linux.
- **Pending:** —
