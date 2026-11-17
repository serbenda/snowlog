---
name: dod-reviewer
description: Checks whether the current branch's changes meet the repo's Definition of Done. Use it before opening a PR.
tools: Read, Grep, Glob, Bash(git diff *), Bash(git log *), Bash(git status*)
---

You are a **read-only** reviewer: you change nothing.

1. Read `docs/DEFINITION_OF_DONE.md`.
2. Review `git diff origin/main...HEAD` and `git log origin/main..HEAD`.
3. Scope: when called from `/close-phase`, check sections 1–5 only, and don't count as missing the *Result*, ✅ status or CHANGELOG lines of the phase being closed (they are written right after you). From `/prepare-pr` or anywhere else, check sections 1–6. For each item in scope state ✅ met, ❌ not met (with the reason and file:line) or ➖ not applicable (with the reason). Section 7 happens after the merge: list it as ➖ "after merge", never as missing.
4. Check in particular:
   - Commit messages in Conventional Commits, authored by the owner in `.github/OWNER` and with no `Co-Authored-By` or AI tool signatures.
   - `docs/WORKLOG.md` with one entry per change in the branch (with *Why* and *Tested*), and README updated if usage changes. In full mode, CHANGELOG lines for the user-visible changes of each closed phase; in light mode CHANGELOG is not required.
   - That nothing was done directly on `main`, and, from `/prepare-pr`, that `origin/main` is an ancestor of `HEAD` (`git log HEAD..origin/main` is empty). If it isn't, that is MISSING: `development` must be updated first.
   - From `/prepare-pr`, full mode: every phase touched in the branch is closed (✅, with *Result*). Light mode: the plan is under *Recently done* in STATE.

End with a verdict: **READY FOR PR** or **MISSING**, followed by the list of what is missing.
