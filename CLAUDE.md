# CLAUDE.md

This repository's rules live in AGENTS.md and apply to any agent. They are imported here:

@AGENTS.md

## Specific to Claude Code

- **Project mode:** read *Mode* in `docs/STATE.md` first; light and full use different amounts of process (`AGENTS.md` → Project mode).
- **Project configuration:** `.claude/settings.json` disables attribution in commits and PRs, defines permissions (deny / ask / allow), the sandbox and the `.claude/hooks/guard.sh` hook. Owner-only, enforced by deny rules, the hook and the sandbox: `.claude/` (except `launch.json`), `.githooks/`, `.github/` and the enforcement scripts in `scripts/`. When a phase needs a change there (for example the stack's CI job in P03), write the exact change in the phase file for the owner to apply.
- **Skills:** `.claude/skills/` (`security-audit`, `repo-security-posture`, 3 Anthropic skills for software work and our own `record-changes`, which writes `docs/WORKLOG.md` after every change and CHANGELOG when closing a phase). Global skills in `~/.claude/skills` are also available. They are pinned to a commit; see `.claude/skills/UPSTREAM.md`.
- **Subagents:** `security-reviewer`, `dod-reviewer` and `architecture-reviewer` in `.claude/agents/`. Run them before opening a PR. They are read-only. `challenger` (also read-only) gives the independent second opinion used by `/challenge` and `/decision`.
- **Commands** (`.claude/commands/`):
  - `/status`: at the start of every session. Summarizes STATE and says what's next.
  - `/new-phase <what>`: creates the phase file and proposes the plan. Writes no code until it is approved.
  - `/close-phase`: checks criteria and DoD, fills in the result and updates STATE, ROADMAP and CHANGELOG.
  - `/decision <what>`: records an ADR in `docs/decisions/`, challenged before it is shown.
  - `/challenge [what]`: independent second opinion on any decision, plan, idea or text, with a side-by-side comparison. Also when the owner just says "challenge".
  - `/prepare-pr`: verification, reviewers and a `development → main` PR without attribution.
- **Preview:** `.claude/launch.json` is empty. If the project has a local server, add it in phase P03: it is the only file in `.claude/` you may edit.
- For tasks spanning more than one phase or with design doubts, use plan mode before touching code.
- If a hook blocks an action, **do not try to work around it** with another command: explain to the owner what you were trying to do and why.
