---
description: Checks the work is closed, runs the reviewers and opens the development → main PR from the PR template, without AI signatures.
---

Order: `/close-phase` first (full mode: every phase in the PR closed; light mode: the plan under *Recently done* in STATE), then this. It checks section 6 of the Definition of Done; section 7 is for after the merge.

1. Check that you are on `development` and there are no uncommitted changes (`git status`). If not, **stop**.
2. Check the work is closed: full mode, every phase in `git log origin/main..HEAD` is ✅ with its *Result*; light mode, STATE has the plan under *Recently done*. If not, **stop** and tell me to run `/close-phase`.
3. `git fetch origin`, then check `git log HEAD..origin/main` is empty. If `main` has commits that `development` lacks, **stop**: propose `git merge --no-ff origin/main` (as its own command), and start again after it.
4. Run the *Verify* commands in `docs/SETUP.md`. If anything fails, **stop** and show me the error.
5. Launch the `dod-reviewer`, `security-reviewer` and `architecture-reviewer` subagents in parallel.
6. If any returns Critical or High findings, or the verdict is MISSING or REVIEW: **stop**, show me the summary and do not open the PR.
7. Write the PR text by filling in `.github/pull_request_template.md`: what changes, the phase files (full mode) or the plan in STATE (light mode), how it was tested, the reviewers' verdicts and the DoD (anything not applicable, with its reason). **No** "Generated with" lines, no session links and no AI tool signatures.
8. Show me the title and text. Once I confirm: `git push origin development` (as its own command), then `gh pr create --base main --head development --title "…" --body-file <file>`.
9. Never merge the PR: I merge it. After the merge, section 7 of the DoD is mine; `/status` will remind me of what is left.

$ARGUMENTS
