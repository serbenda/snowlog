# Third-party skills

> `record-changes/` is this template's **own** skill: it has no external origin and can be edited.

Copies **pinned to a commit**, reviewed before being added. They are not edited by hand: to update, replace the whole folder with the new version, review the diff in a PR and update this table.

| Skill | Origin | Commit | License | Reviewed |
|---|---|---|---|---|
| `security-audit` | [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) | `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8` | MIT (see `security-audit/LICENSE`) | 2026-11-10 |
| `repo-security-posture` | [superagent-ai/skills](https://github.com/superagent-ai/skills) → `skills/repo-security-posture` | `0da315b873ed141025fa601ed6e0ebe0c878d5af` | MIT (see `repo-security-posture/LICENSE`) | 2026-11-11 |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) → `skills/frontend-design` | `2c5958e` | Apache-2.0 (see `frontend-design/LICENSE.txt`) | 2026-11-13 |
| `mcp-builder` | [anthropics/skills](https://github.com/anthropics/skills) → `skills/mcp-builder` | `2c5958e` | Apache-2.0 (see `mcp-builder/LICENSE.txt`) | 2026-11-13 |
| `webapp-testing` | [anthropics/skills](https://github.com/anthropics/skills) → `skills/webapp-testing` | `2c5958e` | Apache-2.0 (see `webapp-testing/LICENSE.txt`) | 2026-11-13 |

## security-audit

Defensive security audit in six phases: reconnaissance, hunting, adversarial validation, structured output, independent verification and report.

- **Guidance mode** (default): questions or targeted reviews. Creates no files.
- **Full audit mode**: only when explicitly requested, for example: *"run a full security audit of this repo"*.
- Results are saved **outside the repo** (`~/security-audit-skill/<repo>/run-N`). If they are ever saved inside, the folder must be in `.gitignore`.
- Validating the findings requires Node.js:
  `node .claude/skills/security-audit/validate-findings.cjs <findings.json>`

## repo-security-posture

Reviews the repo's GitHub configuration: branch protection, CODEOWNERS, Actions, releases, access and dependencies. Delivers a task list ordered by severity.

- Reviewed: `scripts/collect.py` only makes **read** requests to `api.github.com` and `raw.githubusercontent.com`, changes no settings and masks any tokens it finds in files.
- Usage: `GITHUB_TOKEN=<read-only token> python3 .claude/skills/repo-security-posture/scripts/collect.py serbenda/<repo> --output /tmp/audit.json`
- Use the token with the fewest permissions possible (fine-grained, read-only, that repo only). It complements `scripts/setup-repo.sh`: the script applies the protection and this skill checks it is still in place.

## Updating `security-audit`
```bash
git clone --depth 1 https://github.com/cloudflare/security-audit-skill /tmp/sas
rm -rf .claude/skills/security-audit
cp -a /tmp/sas/skills/security-audit .claude/skills/
cp /tmp/sas/LICENSE .claude/skills/security-audit/
git -C /tmp/sas rev-parse HEAD   # record the commit in the table
```

For `repo-security-posture` the process is the same, copying `skills/<name>` from the source repo and its `LICENSE`.

## Anthropic skills

3 of the 19 skills from [anthropics/skills](https://github.com/anthropics/skills) (commit `2c5958e`): the ones useful for building software that don't already ship with Claude. None of them bundles the third-party components listed in the source repo's `THIRD_PARTY_NOTICES.md` (fonts, Pillow, imageio, FFmpeg), so that file is not copied.

- Left out on purpose: `docx`, `pdf`, `pptx`, `xlsx` and `skill-creator` (they ship with the owner's account as `anthropic-skills:`); `claude-api` (built into Claude Code and updated with it, while a pinned copy here would go stale and take precedence inside the repo); `doc-coauthoring` (overlaps with the template's own way of writing VISION, phase files and ADRs); `brand-guidelines`, `internal-comms`, `academy-guide` and `discernment-nudge` (Anthropic-internal or course material); `canvas-design`, `algorithmic-art`, `theme-factory`, `slack-gif-creator` and `web-artifacts-builder` (design and claude.ai artifacts, not software projects). Every skill adds its description to every session and competes to trigger, so only what a project usually needs is kept. Add any of them back from the source repo if a project needs it.
- `webapp-testing` and `mcp-builder` include Python scripts that run when the skill is used: review them before first use and don't run them on files of unknown origin.
- To update: `git clone --depth 1 https://github.com/anthropics/skills /tmp/as`, replace the folders, review the diff and update this table.
