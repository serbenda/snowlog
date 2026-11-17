---
name: record-changes
description: Records the context of every repo change in docs/WORKLOG.md (why, what was rejected, files, commits, how it was tested and what is pending). Use it ALWAYS after finishing any change (code, configuration, CI, documentation) and before committing, even if nobody asks for it. Also when the owner asks what changed, when or why, and when closing a phase (full mode) to write the phase's CHANGELOG lines.
---

# Recording changes

You remember nothing between sessions. Whatever is not written down here is lost. There are two records, and they must not repeat each other:

| File | For whom | When it is written | What it holds |
|---|---|---|---|
| `docs/WORKLOG.md` | The owner and the next agent | **After every change**, in both modes | The **context**: why, what was rejected, files, commits, how it was tested, pending |
| `CHANGELOG.md` | Whoever uses the project | **Only when closing a phase**, and only in full mode | One line per **user-visible** change of the phase, [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format |

`docs/STATE.md` is something else: the current state in ≤150 lines. Do not copy the worklog into STATE; at most, link the entry.

## When

- When a change is finished, **before the commit**, so the record and the change go in the same commit.
- **One entry per piece of work** (a step of the plan, a fix, a PR), not per commit. Follow-up commits of the same work (review fixes, typos, CI fixes) update that entry, under *Tested* or *Pending*, instead of adding new ones.
- If the change took several commits, a single entry citing all of them.
- Do not record intermediate steps or discarded attempts as entries of their own: they go inside the entry, under *Rejected*.

## 1. docs/WORKLOG.md

**Always**, in both modes, also for internal changes. New entry **at the top** (reverse chronological order), in this format:

```markdown
## YYYY-MM-DD — Short title of the change
- **Phase / issue:** P03 · #12 (or "—")
- **What:** what changes, in 1-2 sentences. Keep it short: the diff already shows it.
- **Why:** the reason or the problem it solves. This is the most important part: the what shows in the diff, the why does not.
- **Rejected:** alternatives that were considered and why not (if any).
- **Files:** the main ones, with path.
- **Commits:** `abc1234` (fill it in after the commit with a `docs: worklog` commit if needed, or in the next entry).
- **Tested:** command or steps that show it works.
- **Pending:** what is left open, or "nothing".
```

Rules:
- Today's real date (`date +%F`), never made up.
- Verifiable facts: if you have not tested it, write "untested", not "works".
- No secrets, tokens, passwords or personal data, even if they appear in the change.
- Do not edit old entries except to correct a wrong fact; in that case, add "(corrected YYYY-MM-DD)".
- If a decision is hard to undo, the entry links the ADR in `docs/decisions/` instead of repeating the reasoning.

## 2. CHANGELOG.md (full mode, when closing a phase)

Written once per phase by `/close-phase`, never per change, so it doesn't duplicate the worklog. In light mode it is not used.

- Only what the project's users notice (functionality, configuration, behaviour, security, dependencies). Internal refactors and typo fixes do **not** go in.
- `## [Unreleased]` section, in the matching subsection, in this order: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
- One line per change, in English, as a fact: "Province filter on the map", not "I have added…". Link the phase file or ADR.
- Write it from the phase's *Result*, not by copying worklog entries.
- Do not rewrite entries of already released versions.

## 3. Final check

Before the commit, go over:
- [ ] Is there an entry in `docs/WORKLOG.md` with *Why* and *Tested*? CI's **Records** check refuses a PR that changes anything other than documentation (Markdown under `.claude/` counts as code) unless the worklog gains a `## YYYY-MM-DD — title` heading with a filled-in *Why* and *Tested*.
- [ ] Has the state or the next step changed? Then update `docs/STATE.md`.
- [ ] Closing a phase in full mode? Then its user-visible changes are in `CHANGELOG.md`.
