# Security: what this template protects and what you have to do

Security works in layers. If one fails, the next one stops the blow.

```
Your GitHub account ─┬─ 2FA with security key/passkey, expiring tokens, reviewed apps
Your Mac ────────────┼─ FileVault, global ~/.claude/settings.json, keys in the keychain
The agent (Claude) ──┼─ .claude/settings.json (permissions + sandbox) + .claude/hooks/guard.sh
The design ──────────┼─ docs/THREAT_MODEL.md + Security impact per phase + security-reviewer
Local git ───────────┼─ .githooks/pre-commit (guardrails, Gitleaks) + commit-msg (AI signatures, author) + pre-push (no main, no force)
GitHub (server) ─────┴─ main ruleset, CI (Secrets, Authorship, Hook, Records, SAST, Dependencies)
```

## 1. What the template already does

| Layer | Protection | Where |
|---|---|---|
| Agent | No AI signature in commits or PRs | `.claude/settings.json` → `attribution` |
| Agent | Does not read `.env`, SSH keys, AWS/gh credentials | `permissions.deny` + hook |
| Agent | Asks before `git push`, `curl`, installing packages | `permissions.ask` |
| Agent | **Sandbox** (enforced by the operating system, not by matching text): shell commands can only write inside the project, never to `.claude/`, `.githooks/`, `.github/`, `.devcontainer/`, `.git/` or the enforcement scripts; they reach only an allow-list of domains (GitHub, npm, PyPI, Go, crates, pub); `~/.ssh`, `~/.aws`, `~/.docker`, the gh token and the keychain are unreadable. Docker runs inside it too, so it can't mount the host. `git` and `gh` run outside it (they need your credentials): the hook allows only literal pushes to `development` or a work branch. Any new domain must be added on purpose | `.claude/settings.json` → `sandbox` |
| Agent | Blocks push to main, force push, `gh pr merge`, `rm -rf`, `curl \| sh`, dumping tokens, writing secrets to files. **Fails closed**: if the guard is missing, can't parse a command or crashes, the action is blocked. It runs **from the last commit** (`git cat-file blob HEAD:…`), so a changed copy on disk is ignored, and a **tripwire** refuses everything but reading while any guardrail file differs from the last commit. It also stops git itself (which runs outside the sandbox) from rewriting guardrails from another revision, a stash or a patch, from writing files with `--output`/`-o`, and from running programs (`--upload-pack`, `--exec`, `grep -O`, `bisect run`); the tripwire also refuses a `.git/config` that switches the hooks off, redirects pushes or makes git run programs. gh flags between its words (`gh pr --repo o/r merge`) don't dodge the owner-only rules | `.claude/hooks/guard.sh` (tested by `scripts/test-guard.sh`) |
| Git | Strips AI `Co-Authored-By` and rejects commits with a different email | `.githooks/commit-msg` |
| Git | Refuses any commit that changes the guardrails (`.claude/` settings, hook, commands, subagents, skills; `.githooks/`; `.github/`; enforcement scripts), however it was staged, and automatic merges or applied patches that bring such a change (`pre-merge-commit`, `pre-applypatch`). The owner commits those with `GUARDRAILS_OWNER_CHANGE=1`, which the agent is blocked from setting | `.githooks/pre-commit` |
| Git | Scans staged changes for secrets with Gitleaks before the commit exists; **refuses the commit if Gitleaks isn't installed** | `.githooks/pre-commit` |
| Git | Refuses any push to `main`/`master` and any force push (an update that would drop commits on the remote), whatever tool or spelling produced it | `.githooks/pre-push` |
| GitHub | `main` protected: PR required, the six checks green **and up to date with main** (strict), no force-push or deletion, no squash merges (so `development` and `main` don't drift). **Not available on private repos with GitHub Free**: the script warns and exits with an error | `scripts/setup-repo.sh` |
| CI | Gitleaks (secrets), AI signatures and author, shellcheck, actionlint (pinned, checksum verified) and the tests of the guard, git hooks, records check and scripts, a real worklog entry (dated heading, Why, Tested) and STATE size (Records; a PR is exempt only when GitHub says Dependabot opened it) | `.github/workflows/ci.yml` |
| Dependencies | Dependabot updates the pinned GitHub Actions and the scanner images (Semgrep, OSV-Scanner, pinned by tag and digest in `.scanners/*/Dockerfile`) weekly, with a 7-day **cooldown** so a freshly compromised release isn't proposed | `.github/dependabot.yml` |
| CI | **SAST**: Semgrep (`p/default`, any language) fails on injection, unsafe deserialisation, weak crypto, debug flags, insecure CI… | `ci.yml` → `sast` |
| CI | **Dependencies**: OSV-Scanner fails if any lockfile has a dependency with a known vulnerability | `ci.yml` → `dependencies` |
| Design | Threat model before the first sensitive code, *Security impact* per phase, security DoD per project type (authorisation per object, password hashing, rate limits, CORS, headers, cookies, uploads, backups) | `docs/THREAT_MODEL.md`, `docs/DEFINITION_OF_DONE.md` |
| CI | Actions pinned to a **SHA** (not to a tag that can be moved) | all workflows |
| CI | Minimal permissions (`contents: read`) and PR text passed via environment variables (no injection) | workflows |
| GitHub | Dependabot alerts and private vulnerability reporting | `scripts/setup-repo.sh` |
| GitHub | Optional: the agent works from **its own account** with write access only, and every PR into `main` needs the owner's approval as code owner, so the agent can't approve, change settings, force-push or delete `main` or `development`, or touch tags, even if every local control failed (it can merge a PR the owner approved: the approval is the gate) | `AGENT_BOT=<login>` in `scripts/setup-repo.sh`, `.github/CODEOWNERS` |
| Agent | Optional: Claude Code in a **dev container** that sees only the project (pinned base image, checksummed tools) | `.devcontainer/` |

**What the guard can't do.** It reads command text, so it is a strong filter, not a wall:
- A program the agent writes and then runs (`python3 script.py`, a test, a build step) is not text the guard can read: it can read its own environment or start git. The guard refuses the plain forms on the command line (`os.environ["GH_TOKEN"]`, `python3 -c '…subprocess…git…'`) and the usual ways of building names at run time (`getattr`, `vars()`, `eval`, `process[…]`, `sys.modules`…), but a one-liner is a program too: no list of patterns can follow every way code computes a name, so the barrier for scripts and one-liners alike is the **sandbox**: every process they start, git included, can't write `.git/` or the guardrail files and can't read `~/.config/gh` or the Keychain, so it can't commit or change refs. What's left is pushing a work branch with a token taken from the environment, which the ruleset (no direct pushes to `main`), CI and your PR review catch. So keep tokens out of the agent's environment where you can (outside the dev container `gh` keeps its token in the Keychain), and use a fine-grained token with the least scope (section 2).
- git and gh run outside the sandbox because they need your credentials and network. The guard checks every git and gh command (only listed subcommands, no options that write files or run programs, nothing that changes guardrails, `reset` only backwards, `merge` only `--no-ff`, a git change and a commit or push in separate commands, `git config` read one key at a time and never a key or remote URL that holds a credential). The `.git/config` tripwire also refuses credential helpers, URL rewrites, pagers and a branch that tracks anything but `origin`; an untracked guardrail file trips it even when it is git-ignored. The final barriers are the git hooks, the GitHub ruleset, CODEOWNERS and the agent's own account.

## 2. What you have to do (once)

### GitHub account
- [ ] **2FA with a passkey or physical security key** (Settings → Password and authentication). Keep the recovery codes off the computer.
- [ ] **Tokens:** *fine-grained* only, with an expiry (90 days max), limited to the repos they need and read-only unless writing is required. Delete the *classic* ones.
- [ ] **Apps and OAuth** (Settings → Applications): review every quarter and remove what you don't use. The Claude GitHub app should only have access to the repos you choose, not all of them.
- [ ] **SSH keys** with a passphrase, one per machine. Delete keys from old machines.
- [ ] **Security alert emails** enabled (Settings → Notifications → Security alerts).

### Signing commits (recommended)
Proves the commit was made by you and not by someone using your email.
```bash
# Use your SSH key for signing too
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
```
Add the same key on GitHub as a **Signing key** (Settings → SSH and GPG keys) and enable **Vigilant mode**. Then, in each new repo: `SIGNED_COMMITS=1 ./scripts/setup-repo.sh` (it can be combined with `AGENT_BOT=…` and `MODE=…`). The agent can't change your git config, so these commands are yours to run.

### Agent identity (recommended in full mode)
Without it, Claude pushes and opens PRs **as you**: the guard, the sandbox and the git hooks stop mistakes and most prompt injection, but they read text on your machine, and GitHub can't tell the agent from you. A separate account makes GitHub itself the boundary: the agent can push branches and open PRs. It can't approve, change settings, rulesets or secrets, force-push or delete `main` or `development`, create or move tags (only repository admins can), or skip your review. Required checks count only when GitHub Actions reports them, so it can't mark them green by posting a commit status. With write access it can merge a PR once you approved it: your approval is the gate. Run `setup-repo.sh` again with the same `AGENT_BOT` every time: without it the script refuses to drop your review.
1. Create a GitHub account for the agent (for example `<you>-agent`) with 2FA, and keep its recovery codes with yours.
2. Run `AGENT_BOT=<that login> ./scripts/setup-repo.sh`. It gives the account **write** access only, and changes the main ruleset to require **your approval as code owner** ([`.github/CODEOWNERS`](../.github/CODEOWNERS)) on every PR, re-approved after any new push. Accept the invitation from the agent's account.
3. From the agent's account, create a **fine-grained token** for this repository only (Contents and Pull requests: read and write; nothing else; 90 days). Store it in the Keychain: `security add-generic-password -s claude-agent-gh -a "$USER" -w` (it asks for the value; never paste it in a chat).
4. Use an HTTPS remote (`git remote set-url origin https://github.com/<owner>/<repo>.git`) and start Claude with that token, so both `gh` and `git push` act as the agent:
   ```bash
   GH_TOKEN="$(security find-generic-password -s claude-agent-gh -w)" claude
   ```
   `gh auth setup-git` once makes git use the same token. Your own pushes and merges keep using your account.

Commits stay authored by you (the author check in `commit-msg` and CI is unchanged); what changes is who pushes them and who can approve them.

### Dev container (recommended in full mode)
[`.devcontainer/`](../.devcontainer/) runs Claude Code in a container that sees only the project's files: not your home folder, keychain, browser or other repos. **Credentials are a separate matter:** VS Code forwards your git credential helper into the container and copies `~/.gitconfig` by default, so the agent there can still push as you (`devcontainer.json` empties `SSH_AUTH_SOCK`, so your SSH agent is not reachable). To cut that, use it together with an agent account and either start it with the `devcontainer` CLI (`devcontainer up --workspace-folder .` then `devcontainer exec --workspace-folder . claude`, which forwards neither), or in VS Code set `dev.containers.copyGitConfig` to false, `dev.containers.gitCredentialHelperConfigLocation` to `none`, and open VS Code without `SSH_AUTH_SOCK`. Export the agent's token as `CLAUDE_AGENT_GH_TOKEN` before starting the container; `devcontainer.json` passes it in as `GH_TOKEN`. The base image is pinned by digest, Gitleaks and Node.js (22; Ubuntu's 18 is too old for Claude Code) by checksum and Claude Code by a version at least a week old; Dependabot proposes updates to the base image. The container runs with **seccomp, AppArmor and `/proc` paths unconfined** (`systempaths=unconfined`): Docker's default profiles don't let bubblewrap create the namespaces Claude Code's sandbox needs, and its masked `/proc` paths stop bubblewrap mounting `/proc`; that sandbox refuses every command when it can't start. The trade-off: code in the container reaches more of the kernel's system calls and sees `/proc` unmasked. With `/proc/sys` and `/proc/sysrq-trigger` writable, **root in the container could escape without any exploit** (for example through `kernel.core_pattern`), so three settings carry the weight and must stay: `USER vscode` (the agent never runs as root), `no-new-privileges` (the base image's passwordless `sudo` stops working) and `--cap-drop=ALL` (no capabilities at all; bubblewrap, git and npm need none). Never `docker exec -u 0` into it. Which kernel: on a Mac (Docker Desktop, OrbStack) it is the Docker VM's, not macOS's; on a Linux host it is the host's own, so the exposure is larger there. In exchange the agent keeps both layers: the container, and the sandbox's limits on network and writes inside it. Weighed and rejected: Claude Code's `enableWeakerNestedSandbox` (it would avoid `systempaths=unconfined`, but sandboxed commands would read the container's `/proc`, including the environment of the process holding `GH_TOKEN`); a custom seccomp profile (Docker's default plus the namespace calls: the principled option on Linux hosts, but a copy of Docker's profile to keep in step by hand). The `Devcontainer` workflow builds it on every PR that changes it and checks that bubblewrap can start a sandbox with the container's options. The project folder, `.git/` included, is writable from the container: something written to `.git/config` or `.git/hooks` there runs when you use git on the Mac, so after a container session check `git config --local --list` before running git on the host, and `sync-from-template.sh` runs the project's git with fsmonitor and hooks off. Inside it, `/status` stops warning about running on the host.

### Your Mac
- [ ] `brew install gitleaks`, so `.githooks/pre-commit` can stop a secret before it is committed.
- [ ] **FileVault** enabled and a quick screen lock.
- [ ] Copy the block in [Global Claude Code settings](#global-claude-code-settings) to `~/.claude/settings.json`: it applies the protection **to all your projects**, including those not created from the template. If you already have that file, merge the keys by hand.
- [ ] Secrets go in the **Keychain** or in a `.env` outside the repo, never in the code.

### Global Claude Code settings
Copy it once to `~/.claude/settings.json` (or merge it into the file you have). It is the baseline for every folder you open Claude Code in: no reading secrets, browser data or the keychain; no editing its own settings, your shell profile, git config or SSH keys; no bypass-permissions mode; project MCP servers need your approval. Each project's `.claude/settings.json` (with its sandbox) and hook add the rest. The sandbox is not enabled globally on purpose: it would also apply to folders that need other domains or tools.

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "attribution": {
    "commit": "",
    "pr": ""
  },
  "includeCoAuthoredBy": false,
  "permissions": {
    "deny": [
      "Read(**/.env)",
      "Read(**/.env.*)",
      "Read(**/*.pem)",
      "Read(**/*.key)",
      "Read(**/secrets/**)",
      "Read(~/.ssh/**)",
      "Read(~/.aws/**)",
      "Read(~/.config/gh/**)",
      "Read(~/.config/gcloud/**)",
      "Read(~/.kube/**)",
      "Read(~/.docker/config.json)",
      "Read(~/.netrc)",
      "Read(~/.npmrc)",
      "Read(~/Library/Keychains/**)",
      "Bash(git push --force *)",
      "Bash(git push -f *)",
      "Bash(gh pr merge *)",
      "Bash(gh repo delete *)",
      "Bash(gh secret *)",
      "Bash(rm -rf *)",
      "Bash(sudo *)",
      "Bash(printenv*)",
      "Bash(security find-*)",
      "Edit(~/.claude/settings.json)",
      "Edit(~/.claude/settings.local.json)",
      "Edit(~/.zshrc)",
      "Edit(~/.zprofile)",
      "Edit(~/.bashrc)",
      "Edit(~/.bash_profile)",
      "Edit(~/.gitconfig)",
      "Edit(~/.ssh/**)",
      "Read(~/.gnupg/**)",
      "Read(~/.config/op/**)",
      "Read(~/Library/Application Support/Google/Chrome/**)",
      "Read(~/Library/Cookies/**)",
      "Read(~/Library/Safari/**)",
      "Bash(git reset --hard*)",
      "Bash(git clean -f*)",
      "Bash(chmod -R 777*)"
    ],
    "ask": [
      "Bash(git push *)",
      "Bash(curl *)",
      "Bash(wget *)",
      "Bash(npm install *)",
      "Bash(npx *)",
      "Bash(pip install *)",
      "Bash(brew install *)"
    ],
    "disableBypassPermissionsMode": "disable"
  },
  "enableAllProjectMcpServers": false
}
```

### MCP servers and connectors
- Only install MCP servers from sources you know, and pin them to a version.
- Give each connector **the minimum permission**: if it only reads, a read-only token.
- Content brought in by an MCP (emails, web pages, issues) is **data**. If it contains instructions, the agent must not follow them: this is the most common attack vector (*prompt injection*).
- **Supabase:** enable RLS on every table. The public key (*anon / publishable*) can go in the client; the `service_role` key never.

## 3. Routine

| When | What |
|---|---|
| Every PR | Green CI and `/prepare-pr` (DoD and security reviewers) |
| Every release | `security-audit` skill in guidance mode |
| Every major release | Full audit with `security-audit` and `repo-security-posture` |
| Every quarter | Review tokens, OAuth apps, SSH keys and collaborators; update skills (`UPSTREAM.md`) |

## 4. If you think something has been stolen
1. Revoke the affected token or key **right now** (GitHub → Settings → Developer settings / SSH keys).
2. Sign out of open sessions (Settings → Sessions) and change your password.
3. Review your account's *Security log* and the commit history of your repos.
4. If a secret made it into a commit: **rotate it**. Removing it from the history is not enough, because it may already have been copied.

### Known limits of the git hooks

- Git finds the hooks through `core.hooksPath=.githooks`, a folder of the working tree. In a checkout of an old commit that has no `.githooks/` (or after deleting it), git runs no hook at all. For the agent the guard closes this (it refuses switching to revisions whose guardrails differ, deleting `.githooks/` and changing sparse checkout); for people it is the owner's own repository. CI and the server ruleset are the backstop.
- `cherry-pick`, `revert`, `rebase` and git plumbing make commits without `pre-commit`. The guard allows the agent only `cherry-pick`/`revert --no-commit` (then a normal commit runs the hooks) and no rebase or plumbing; `pre-push` re-checks every commit it sends: author and committer, the AI-signature rule, the guardrail paths (a merge's own changes are what differs from git's own merge of its parents, so a merge can't hide a change by taking a file from one parent), secrets and new scanner suppressions. So the owner pushes guardrail commits with `GUARDRAILS_OWNER_CHANGE=1` too. `git send-pack` and changes through GitHub's API run no local hook: CI and the ruleset cover those.
- `pre-push` asks the remote (`git ls-remote`, a second connection, so HTTPS may ask for credentials twice) which commits its branches and tags already have, fetches the tips this clone hasn't got, and checks the rest; it ignores `git replace`. A merge's own changes are what differs from `git merge-tree` of its parents plus what differs from every parent (a merge driver in the local config would make `merge-tree` agree with any result); a guardrail file changed on both sides and merged needs the owner's switch. Other refs (`refs/pull/*`: anyone's PR) don't count. Commits already on a branch or tag are not checked again: they came through this hook, through a PR GitHub merged after the owner's review, or from Dependabot (whose branches nobody merges locally). Whoever has write access can push a branch, so in a repository with collaborators their branches count as known too. The first push to an empty remote checks the whole history: commits made on GitHub's web UI before it can't be pushed from a clone.
- Secrets are scanned in pre-commit, pre-push and CI with `gitleaks:allow` ignored, and so are commit messages (commit-msg, pre-push, CI), branch names (pre-push, CI) and the PR's title and description (CI). The text of the changes is scanned too, so binary files, `-diff` attributes and the paths gitleaks skips by default (lockfiles, `node_modules`, images) are covered. `GITLEAKS_*` variables are cleared first (they would replace the configuration). A false positive goes in `.gitleaks.toml` as an `[[allowlists]]` entry with its reason, which only the owner edits: `.gitleaksignore` fingerprints name a file and line, which the text scan doesn't have. A secret split across lines or encoded (base64, hex) is not recognised by any of them.
- Inline Semgrep and OSV-Scanner suppressions (`nosemgrep`, `nosem`, `osv-scanner:ignore`) on added lines are the owner's (pre-commit, pre-push). A suppression that is already there, above code that now changes, is not new text and isn't seen; prose files (`.md`, `.txt`, `.rst`, `.adoc`) may mention them.
- Author and committer emails are text anyone with write access can set (also through GitHub's API, which then signs the commit). The hooks and CI's Authorship job keep out mistakes and foreign commits; what authenticates a change is the owner's review (ruleset and CODEOWNERS). The same goes for the Dependabot exemption of the worklog rule.
- The signature pattern matches the usual trailers (`Co-Authored-By`, `Co-developed-by`, `Assisted-by`, `Generated-by`) and any line that starts by saying an AI tool made the change ("Generated with Claude Code v2", "Authored by Copilot"), after quote or list marks too, so a sentence that starts that way is refused as well ("Written with Cursor in mind…"): say it another way. Disguised variants (a zero-width space, look-alike letters, `Co-Authored-By :`) aren't caught; none of them is a git trailer GitHub would show. Below `commit -v`'s scissors line only the diff git adds there is skipped.
- The worklog rule checks an entry's shape (a possible date, a Why of three real words and a Tested of two words or numbers, text that isn't an old entry's, outside comments and code fences), not whether it is true. A new entry counts wherever it is in the file (a back-merge can put newer ones above it).
- The Dependabot exemption of the worklog rule: in a PR, when Dependabot opened it and made its last push; on a push to `development`, when GitHub says the pushed tip is its merge of a PR Dependabot opened. Every commit must be GitHub-verified. Editing or reopening a Dependabot PR makes you the sender, so that run applies the rule (fails closed): ask Dependabot to recreate it. A release PR that only carries Dependabot's updates needs a worklog entry like any other.
- CI's Authorship job runs on PRs. A direct push to `development` is checked by `pre-push` on the owner's machine and by the Secrets and Records jobs, not by Authorship.
- `pre-merge-commit` (an automatic merge) only scans for secrets: what it commits is git's own merge; `pre-push` checks the merge's own changes before it leaves. `main` can be created only by the owner, with the switch, while the remote has no branch at all. Work branches (`feat/`…`hotfix/`, `dependabot/`, `release/`) can be deleted on the remote, so an agent can close a Dependabot or release PR that way (the branch can be pushed again).
- `.claude/launch.json` is the agent's (the preview tool needs it) and what it names is run by the preview tool, outside the guard. Read a changed `launch.json` before starting a preview. Editors and tools that run files on their own, in any folder (`.vscode/settings.json`, `tasks.json`, `launch.json`, `*.code-workspace`, `.envrc`, `.husky/`, `.pre-commit-config.yaml`) are guardrails: the guard refuses writing them and the hooks committing them (the sandbox's denyWrite covers the ones at the root). `.vscode/extensions.json` only recommends extensions and is not. Project files with lifecycle scripts (`package.json`, a `Makefile`) are not: review their scripts in the PR.
- The agent's instructions (`AGENTS.md`, `CLAUDE.md`, `CLAUDE.local.md`, in any folder) are guardrails: an agent talked into it by a prompt injection could otherwise rewrite its own rules, and every later session would read them. The real barriers (guard, hooks, sandbox, CI) don't depend on them, but what the agent tries does. The tripwire leaves out only the root `CLAUDE.local.md` (the owner's own uncommitted file, which would trip it for good; the sandbox's `denyWrite` keeps the agent from writing it) and the instruction files packages ship inside dependency folders (`node_modules/`, `.venv/`, `vendor/`…, a fixed list in the guard): third-party content that would come back on every install. A nested `CLAUDE.local.md` the agent writes some way the guard can't read (a name built in a variable, a script) trips it.
- The guard protects the guardrail names in any folder (a nested `.github/` or `.gitattributes` can't be written by the agent), while the git hooks treat `.claude/`, `.githooks/`, `.github/`, `.devcontainer/`, `.semgrep/`, `.scanners/` and the scripts as guardrails only at the root, where they take effect (scanner settings, `.gitattributes`, the editors' files and the agent's instructions, `AGENTS.md`/`CLAUDE.md`, count in any folder). So a nested `.github/` the owner wrote can be committed by the agent. `test-githooks.sh` checks that the hooks, the guard and CODEOWNERS name the same guardrails.
- `gh` writes (issues, PRs, comments, `gh api` POSTs) go only to the `origin` repository, but what the agent writes there can include any file of the project (`--body-file`): on a public repository that is public. The permission prompt for `gh` writes is the barrier; read what it posts.
- The agent can create files in `.claude/` outside its configuration folders (the guard and sandbox protect settings, hooks, agents, commands, skills, rules, output styles and `CLAUDE.md`), but the hooks refuse committing or pushing any of them.
