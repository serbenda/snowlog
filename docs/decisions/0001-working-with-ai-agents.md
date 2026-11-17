# 0001 — Organizing work with AI agents

- **Status:** accepted
- **Date:** 2026-11-13

## Context
AI agents remember nothing between sessions. Without a written memory of the project, each session rediscovers the status, repeats discussions already settled or widens the scope on its own. In earlier projects a compact status file, phase files and written decisions worked well; mixing two numbering schemes (phases and stages) at the same time caused confusion.

## Options
| Option | Pros | Cons |
|---|---|---|
| GitHub issues only | Already exists, visible in the Project | The agent doesn't read it by default; mixes bugs with planning |
| A single long plan document | Simple | Grows out of control and goes stale |
| STATE + ROADMAP + phase files + ADRs in `docs/` | Each piece has a purpose and a bounded size; lives with the code | Needs maintenance (automated by `/new-phase` and `/close-phase`) |

## Decision
Use the third option: `docs/VISION.md`, `docs/STATE.md` (≤150 lines), `docs/ROADMAP.md` with stages `S0…` and phases `P01…` under a single numbering, phase files in `docs/phases/` and decisions in `docs/decisions/`. Rules for agents go in `AGENTS.md`; `CLAUDE.md` only imports it and adds what is specific to Claude Code.

## Consequences
- Every session starts with `/status` and every phase ends with `/close-phase`, which updates STATE.
- A phase's scope is approved before writing code.
- Accepted decisions are not reopened without a new decision that supersedes them.
