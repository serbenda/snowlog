# Snowlog status

> **Single source of truth for status.** Claude reads it at the start of every session (`/status`) and updates it when closing a phase (`/close-phase`).
> At most **150 lines**: replace what is outdated instead of piling up, and **link** documents instead of copying them.

Last updated: 2026-11-17

## Where we are
- **Mode:** full
- **Current stage:** S3 — Release (see [ROADMAP](ROADMAP.md))
- **Phase in progress:** [P01 — Adopt project-template 1.0.0, everything in English](phases/P01-adopt-project-template.md)
- **Environment:** https://snowlog.bendi.dev/ (GitHub Pages from `main`), the portable file, desktop builds as CI
  artifacts; notes in the private `serbenda/snowlog-notes` ([DEPLOYMENT.md](DEPLOYMENT.md))
- **Working branch:** `development` (PR #6 open to `main`)

## Current work
- [P01](phases/P01-adopt-project-template.md): code, interface and docs in English, with existing vaults kept working;
  the template's docs filled in; the guardrails committed (`014aacd`). Waiting for CI and the owner's review on PR #6.

## Recently done
- Agent and script access: an MCP server over a clone of the notes repository ([AGENT_ACCESS.md](AGENT_ACCESS.md)).
- Tauri desktop builds for Windows, macOS and Linux, with a WebDriver smoke test (PR #6, open).
- Faster first load (GraphQL), line merging between devices, key rotation, drawings from sketch (PR #5).
- The day-to-day features, the portable file and the earlier three-phase plan (PR #4). Details in the CHANGELOG.

## Next
1. Owner: fix GitHub Actions billing (jobs are not starting), then review and merge PR #6.
2. Owner: run `./scripts/setup-repo.sh` so the new checks are required on `main`.
3. P02: an independent security review ([R-001](RISKS.md)) and tests on real Firefox, Safari, phones, macOS and
   Windows ([R-004](RISKS.md)).
4. P03: agent access, phase 2 ([AGENT_ACCESS.md](AGENT_ACCESS.md) → Next).
5. Ideas for later: PKCE in the sign-in ([R-003](RISKS.md)) and a signed index to detect replayed versions ([R-002](RISKS.md)).

## Blocked / awaiting decision
- GitHub Actions doesn't start jobs: "recent account payments have failed or your spending limit needs to be
  increased" (owner: Settings → Billing).

## Open risks
- R-001 no independent review of the encryption yet (High impact), R-002 replayed old versions, R-003 no PKCE,
  R-004 untested browsers and devices, R-005 unsigned executables, R-007 the MCP client sees the decrypted vault.
  Details in [RISKS.md](RISKS.md).

## How to run it
See [SETUP.md](SETUP.md). To run and verify: see its *Daily use* and *Verify* sections.
