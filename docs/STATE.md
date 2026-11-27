# Snowlog status

> **Single source of truth for status.** Claude reads it at the start of every session (`/status`) and updates it when closing a phase (`/close-phase`).
> At most **150 lines**: replace what is outdated instead of piling up, and **link** documents instead of copying them.

Last updated: 2026-11-26

## Where we are
- **Mode:** full
- **Current stage:** S3 — Release (see [ROADMAP](ROADMAP.md))
- **Phase in progress:** [P02 — Independent security review](phases/P02-security-review.md) (tests on real devices: the owner)
- **Environment:** https://snowlog.bendi.dev/ (GitHub Pages from `main`), the portable file, desktop builds as CI
  artifacts; notes in the private `serbenda/snowlog-notes` ([DEPLOYMENT.md](DEPLOYMENT.md))
- **Working branch:** `development`

## Current work
- [P02](phases/P02-security-review.md): an independent security review of the code (the agent), every finding fixed
  with a test; tests on real Firefox, Safari, phones, macOS and Windows (the owner, [R-004](RISKS.md)).
- The license, as bsketch's: all rights reserved, no use by AI ([ADR 0007](decisions/0007-proprietary-license.md)).

## Recently done
- [P06](phases/P06-fuzz-and-performance.md): fuzzing (one Kanban crash fixed) and a 5,000-note vault within budget.
- [P05](phases/P05-vault-format.md): the vault format written down ([FORMAT.md](FORMAT.md)) and tested with a vault made by each version.
- `main` protected (2026-11-26, `setup-repo.sh`): PR required with the six CI checks, no force-push or deletion; `development` and tags protected too.
- [P01](phases/P01-adopt-project-template.md) closed: the template adopted, everything in English (PR #6).
- bsketch's drawing engine after its pre-2.0 audits; Claude Code pinned by a lockfile in the dev container; Pages
  built and deployed in separate jobs (PRs #11, #12, #15).
- The drawing library and templates; saves in the same millisecond no longer clash (PRs #8, #9).
- Agent and script access: an MCP server over a clone of the notes repository ([AGENT_ACCESS.md](AGENT_ACCESS.md)).
- Tauri desktop builds for Windows, macOS and Linux, with a WebDriver smoke test (PR #6, open).
- Faster first load (GraphQL), line merging between devices, key rotation, drawings from sketch (PR #5).
- The day-to-day features, the portable file and the earlier three-phase plan (PR #4). Details in the CHANGELOG.

## Next
1. P02: the agent's part is done (PR #16); the owner tests on real devices (R-004, R-009) to close it.
2. P03: agent access, phase 2 ([AGENT_ACCESS.md](AGENT_ACCESS.md) → Next).
3. P04: the first release (`v1.0.0`).
4. Ideas for later: PKCE in the sign-in ([R-003](RISKS.md)) and a signed index to detect replayed versions ([R-002](RISKS.md)).

## Blocked / awaiting decision
- GitHub Actions doesn't start jobs: "recent account payments have failed or your spending limit needs to be
  increased" (owner: Settings → Billing).

## Open risks
- R-001 no independent review of the encryption yet (High impact), R-002 replayed old versions, R-003 no PKCE,
  R-004 untested browsers and devices, R-005 unsigned executables, R-007 the MCP client sees the decrypted vault.
  Details in [RISKS.md](RISKS.md).

## How to run it
See [SETUP.md](SETUP.md). To run and verify: see its *Daily use* and *Verify* sections.
