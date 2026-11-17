---
description: Summarises where the project stands and what comes next, by reading STATE, ROADMAP and the current phase. Use it at the start of every session.
---

Read-only: do not modify any file.

1. Read `docs/STATE.md` (note its *Mode*). In full mode, also read `docs/ROADMAP.md` and, if there is a current phase, its phase file in `docs/phases/`. In both modes, read the latest entries of `docs/WORKLOG.md`.
2. Check git: current branch, `git status` and `git log --oneline -5`. If you are on `main`, warn me. If `git log HEAD..origin/main` is not empty (a PR was merged since), the next step is to bring `development` up to date (`git merge --no-ff origin/main`) and to remind me of section 7 of the Definition of Done (after the merge).
3. Compare what STATE says with the actual repo (recent commits, phase files). If STATE is out of date, say so and point out what is missing.
4. Answer briefly in this format:
   - **Mode / stage / phase:** … (light: just the current work)
   - **Last done:** …
   - **Concrete next step:** … (one, the one that can be started now)
   - **Blockers or decisions pending from the owner:** …
   - **Warnings:** STATE out of date, uncommitted changes, open High risks… In full mode, if `test -n "${CLAUDE_DEVCONTAINER:-}"` fails, say that the session runs on the host and the dev container is recommended (`docs/SECURITY_GUIDE.md` → *Dev container*). In light mode, also say if the project now meets any criterion for switching to full (`AGENTS.md` → Project mode).

$ARGUMENTS
