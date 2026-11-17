# 0006 — Adopt project-template 1.0.0 in full mode, with everything in English

- **Status:** accepted
- **Date:** 2026-11-17

## Context
Snowlog was created from an older, Spanish version of [project-template](https://github.com/serbenda/project-template),
with its own `CLAUDE.md`, a `docs/CONTEXT.md` and an authorship check in CI. The template's 1.0.0 brings a stronger
guard hook, git hooks, more CI jobs (SAST, dependencies, records), a documented way of working (vision, state,
worklog, phases, decisions) and a rule that the whole repository is in English. The owner asked for both of his
projects to use the template, starting with sketch ([sketch's ADR 0004](https://github.com/serbenda/sketch/blob/development/docs/decisions/0004-adopt-project-template-in-english.md)),
and for everything to be in English.

## Options
| Option | Pros | Cons |
|---|---|---|
| A. Adopt 1.0.0 fully, everything in English (interface included) | One set of rules across projects; the template's English-only files fit | A one-off translation; existing vaults use Spanish folder names; the agent can no longer change `.github/`, `.claude/`, hooks or its own instructions |
| B. Only the template-owned files (hooks, guard, agents) | Smaller change | Two ways of working side by side; records and docs missing |
| C. Keep Spanish, deviating from the template | No translation | The records check, commands, agents and PR template are English and are replaced on every sync |

## Challenge
The same two independent challengers that reviewed the plan for both projects (lenses: "living with it in two
years" and "what breaks, and security"). Main objections and how they were handled:
- *The agent can't touch `.github/` any more, so every CI tweak needs the owner* (High): accepted as the price of
  the guardrails; the agent writes the exact change and the owner applies it.
- *Spanish doesn't fit the template* (High): resolved by the owner's choice of English for everything.
- *A deployed project with personal data in light mode contradicts the template* (Medium): Snowlog goes to full mode.
- *The transition order could leave the agent blocked or two hooks side by side* (Medium): one atomic owner commit
  for all guardrails, rehearsed on a copy first.

Raised during Snowlog's migration (not by the challengers): translating could break existing data. Stored names are
data, so vaults with the Spanish folder names keep them, local folders still read `.snowlog/ajustes.json`, and queries
keep `hoy`/`mañana`/`ayer`, each with a test ([R-006](../RISKS.md)).

## Decision
Option A, in full mode.

## Consequences
- The interface, code, comments, tests, docs and commit messages are in English. New vaults get English folders
  (`Home`, `Daily`, `Templates`, `Attachments`, `Drawings`) and templates; dates in templates are written in English.
- `docs/CONTEXT.md`, `SEGURIDAD.md`, `PUESTA-EN-MARCHA.md`, `AGENTES.md`, `PORTATIL.md` and the old
  `DEFINITION-OF-DONE.md` became STATE, ARCHITECTURE, THREAT_MODEL, DEPLOYMENT, AGENT_ACCESS, PORTABLE and
  DEFINITION_OF_DONE.
- Guardrail files are committed only by the owner, with `GUARDRAILS_OWNER_CHANGE=1`; every PR that changes more than
  documentation needs a `docs/WORKLOG.md` entry.
