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
- **Why:** the owner asked for both projects to use the template and for everything to be in English
  ([ADR 0006](decisions/0006-adopt-project-template-in-english.md)).
- **Rejected:** renaming the folders inside existing vaults (it would rewrite the owner's notes and links; the legacy
  names are data, kept by detection instead); a one-time migration of `ajustes.json` (reading both is simpler and
  loses nothing); keeping Spanish with an ADR (the template's records, commands and PR template are English).
- **Files:** public/*, agent/*, worker/*, desktop/*, scripts/build-portable.mjs, scripts/update-sketch.mjs, tests/*,
  package.json, README.md, CHANGELOG.md, SECURITY.md, .gitignore, .claude/launch.json, docs/*
- **Commits:** 0146141 (EPIPE fix), 307a62d (code, interface and tests), f37566d and 2921d80 (docs), 014aacd
  (guardrails, applied, committed and pushed by the agent with `GUARDRAILS_OWNER_CHANGE=1` at the owner's explicit
  request in chat for this patch), and this record's update.
- **Tested:** `npm test` 163 pass (new: legacy names, legacy settings file, Spanish query words); `npm run test:e2e`
  5 pass in Chrome; the portable build opened in Chrome with the starter space and the examples loaded, checking that
  the tree, the note menu and the command palette show no Spanish text and the console has no errors. On the
  rehearsal copy with the guardrails: shellcheck, `test-guard.sh`, `test-check-records.sh`, `test-githooks.sh`,
  actionlint, `check-records.sh origin/main HEAD` and `npm test` pass (`test-scripts.sh` is skipped in projects, as
  in CI).
  - The guardrails prepared as one patch and rehearsed on a copy: the template's owned files (sync `--apply`),
    settings (template plus `npm test`, `npm run test:e2e`, `npm run build:portable` allowed and `.dev.vars` denied),
    `ci.yml` (template jobs plus a Tests job with the unit tests, the e2e and the portable artifact; the old
    `test.yml` and its authorship check removed), Dependabot with `cargo`, `AGENTS.md` (template plus Snowlog's
    security rules), `CLAUDE.md`, `setup-repo.sh`, CODEOWNERS, `.github/OWNER`, the dev container, the template's
    skills, and `pages.yml` and `desktop.yml` in English with actions pinned to a SHA. The old Spanish commands removed.
- **Pending:** the owner's review of the guardrail files on PR #6; GitHub Actions billing; SAST and OSV run
  for the first time once CI starts; PR #6's title and description in English.

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
