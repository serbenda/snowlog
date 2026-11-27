# Roadmap

> **A single numbering system:** stages `S0, S1, S2…` and, within each, phases `P01, P02…` (global numbering, never reset).
> A stage ends when its **exit criterion** is met, which must be checkable, not a feeling.
> If the plan changes, edit this file and explain it in a [decision](decisions/).

| Stage | Goal | Exit criterion | Status |
|---|---|---|---|
| S0 | Define | VISION written, stack and encryption decided (ADRs), local environment running and verifiable (`docs/SETUP.md`) | ✅ |
| S1 | Secure core | Sign-in, encrypted vault, notes and folders, nothing in plaintext in the repository (tested), automatic lock | ✅ |
| S2 | Day to day | Daily note, templates, queries, calendar, backlinks, editor, search, attachments, conflict merging, history, backups, offline use, settings, palette, Kanban, graph, portable file, desktop builds, agent access, e2e in CI | ✅ |
| S3 | Release | Independent security review with no open High findings; portable file tested on real Firefox and Safari; the repo on the template's guardrails; no High risks open | ⏳ |

Legend: ⬜ not started · ⏳ in progress · ✅ done

S0–S2 were done before the project adopted the template (2026-11-09 to 2026-11-17). They followed an earlier
plan in three phases (Essential, Trust, Polish), all done; their history is in [CHANGELOG.md](../CHANGELOG.md),
the PRs (#1–#6) and the worklog's first entry, not in phase files.

## S3 — Release

| Phase | What | Status |
|---|---|---|
| P01 | [Adopt project-template 1.0.0, everything in English](phases/P01-adopt-project-template.md) | ✅ |
| P02 | [Independent security review and fixes; tests on real Firefox, Safari, phones, macOS and Windows](phases/P02-security-review.md) | ⏳ |
| P03 | Agent access, phase 2: edit by section, move, delete, tasks, queries, orphans and a CLI | ⬜ |
| P04 | First release (`v1.0.0`) | ⬜ |
| P05 | [The vault format written down and tested with a vault from each version](phases/P05-vault-format.md) | ✅ |
| P06 | [Fuzzing and a big vault (5,000 notes)](phases/P06-fuzz-and-performance.md) | ✅ |
