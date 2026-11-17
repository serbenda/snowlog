# P01 — Adopt project-template 1.0.0, everything in English

- **Stage:** S3
- **Status:** ⏳ in progress
- **Issue:** —
- **Dates:** 2026-11-17 → —
- **Owner approvals:** 2026-11-17 "I'd like both projects to use project-template"; 2026-11-17 "everything in English"; 2026-11-17 "continue" (Snowlog after sketch); 2026-11-17 "yes, apply it yourself" (the agent applies, commits and pushes the guardrails patch)

## Goal
Snowlog follows the current template (guardrails, CI jobs, documented way of working) and the whole repository,
the interface included, is in English, without breaking existing vaults.

## Scope
**In:**
- Code, interface texts, comments, tests, the MCP server, the Worker, the desktop app and the docs in English;
  `desktop/prueba.mjs` renamed to `smoke-test.mjs`.
- Compatibility with existing data: the earlier Spanish folder names, `.snowlog/ajustes.json` and the Spanish date
  words in queries, each with a test.
- The drawing engine copied again from sketch with its English file names (`scripts/update-sketch.mjs`).
- The template's docs filled in for Snowlog (VISION, STATE, ROADMAP, ARCHITECTURE, THREAT_MODEL, RISKS, SETUP,
  DEFINITION_OF_DONE, WORKLOG, ADRs 0002–0006) from the old CONTEXT, SEGURIDAD, PUESTA-EN-MARCHA, AGENTES and
  PORTATIL; README and CHANGELOG in English.
- The guardrails: the template's owned files (`scripts/sync-from-template.sh --apply`), the files to merge by hand
  (settings, CI with Snowlog's Tests job, Dependabot with `cargo`, `AGENTS.md`, `CLAUDE.md` with Snowlog's rules,
  `setup-repo.sh`, CODEOWNERS, dev container), `.github/OWNER`, and the workflows in English; the old Spanish
  commands and `test.yml` removed.

**Out:**
- New features. The independent security review and the tests on real devices (P02).

## Acceptance criteria
- [x] `npm test` and `npm run test:e2e` pass in English, including the legacy-names, legacy-settings and Spanish
  query-word tests.
- [x] The interface shows no Spanish text in the main flows (checked in Chrome on the portable build: tree, note menu,
  command palette, examples).
- [x] Rehearsed on a copy: `sync --apply`, shellcheck, `test-guard.sh`, `test-check-records.sh`,
  `test-githooks.sh`, actionlint (as in CI), `check-records.sh` on the PR range and `npm test` pass; the commit is
  refused without `GUARDRAILS_OWNER_CHANGE=1` and accepted with it.
- [x] The guardrails commit is on `development` (`014aacd`; applied by the agent at the owner's explicit request).
- [ ] CI is green on the PR: Secrets, Authorship, Hook, Hook (macOS bash 3.2), SAST, Dependencies, Records, Tests.

## Plan
1. Agent: translate the code, interface and tests, with the data compatibility and its tests; commit on `development`.
2. Agent: fill in the template's docs and translate the rest; commit on `development`.
3. Agent: rehearse the sync on a copy and prepare the merged guardrail files as one patch.
4. Owner: apply the guardrails patch on `development` and commit it with `GUARDRAILS_OWNER_CHANGE=1`.
5. Agent or owner: update PR #6 (`development → main`) in English; fix what SAST or OSV report for the first time.

## Security impact
- No new entry point. The guardrails get stronger (guard hook 1.0.0, git hooks with Gitleaks, SAST, OSV, Records).
- The threat model is the old internal security review, translated and organised by the template
  ([THREAT_MODEL.md](../THREAT_MODEL.md)); nothing in the encryption changes.
- New code reads stored data: the legacy settings file goes through the same JSON parsing as before, and the legacy
  folder names only change which folder the app uses, never what is encrypted or uploaded.

## Risks and open questions
- SAST (Semgrep) and OSV-Scanner run on this code for the first time in CI: findings may need fixes.
- The template's sandbox may block Chrome (e2e), git push from the agent tests or cargo inside Claude Code sessions;
  if so, the owner decides whether to add an exception.
- GitHub Actions is not starting jobs on the owner's account (billing): CI can't confirm anything until that is fixed.

---

## Result
<!-- Filled in with /close-phase. -->
- **What was done:**
- **How it was tested:**
- **What was left out and why:**
- **Lessons learned:**
- **PR:** #6
