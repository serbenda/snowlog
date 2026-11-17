#!/usr/bin/env bash
# Sets up a repo freshly created from the template.
# Requires: gh authenticated (gh auth login) with admin permissions on the repo.
# Usage: ./scripts/setup-repo.sh            (detects the repo of the current directory)
#        ./scripts/setup-repo.sh owner/repo
# Options (environment variables):
#   MODE=light            light mode (default: full). See AGENTS.md → Project mode.
#   SIGNED_COMMITS=1      require signed commits on main and development.
#   AGENT_BOT=<login>     the agent has a GitHub account of its own: it gets write access, and every PR into
#                         main needs the owner's approval as code owner. See docs/SECURITY_GUIDE.md → Agent identity.
#                         Pass it again on every run: a run without it would drop the owner's review, so the
#                         script refuses unless REMOVE_OWNER_REVIEW=1 (after removing the agent's access).
# Fails (exit 1) when anything you asked for couldn't be set; re-running it is safe.
set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
# Checked before anything changes: the name goes into sed and API paths.
if [[ ! "$REPO" =~ ^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$ ]]; then
  echo "The repository must be owner/name (letters, digits, '-', '.', '_'): '$REPO'" >&2; exit 2
fi
NAME="${REPO#*/}"
OWNER="${REPO%%/*}"
AGENT_BOT="${AGENT_BOT:-}"
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }   # GitHub logins are case-insensitive
if [[ -n "$AGENT_BOT" && ! "$AGENT_BOT" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,38})$ ]]; then
  echo "AGENT_BOT must be a GitHub login (letters, digits and hyphens): '$AGENT_BOT'" >&2; exit 2
fi
if [[ -n "$AGENT_BOT" && "$(lower "$AGENT_BOT")" == "$(lower "$OWNER")" ]]; then
  echo "AGENT_BOT must be a different account from the owner ($OWNER): that is the whole point." >&2; exit 2
fi
echo "→ Configuring $REPO"

# Admin rights and the default branch, before anything changes: without admin the settings and rulesets
# would fail halfway, and the git hooks, sync and docs assume main.
if [[ "$(gh api "repos/$REPO" --jq .permissions.admin)" != "true" ]]; then
  echo "You need admin rights on $REPO (gh auth status; a fine-grained token needs Administration: write)." >&2; exit 2
fi
if [[ "$(gh api "repos/$REPO" --jq .default_branch)" != "main" ]]; then
  echo "$REPO's default branch must be main (Settings → General → Default branch): the hooks and sync assume it." >&2; exit 2
fi
ruleset_id() {
  gh api --paginate "repos/$REPO/rulesets?includes_parents=false" --jq ".[] | select(.name == \"$1\") | .id" 2>/dev/null | head -1
}
# A run without AGENT_BOT would turn the owner's review off on main: refused when it is on now.
if [[ -z "$AGENT_BOT" && "${REMOVE_OWNER_REVIEW:-0}" != "1" ]] && id="$(ruleset_id "Protect main")" && [[ -n "$id" ]] &&
   [[ "$(gh api "repos/$REPO/rulesets/$id" --jq '[.rules[] | select(.type == "pull_request") | .parameters.require_code_owner_review] | first' 2>/dev/null)" == "true" ]]; then
  echo "main requires the owner's review now (an agent account): run again with AGENT_BOT=<its login>." >&2
  echo "  To drop it on purpose, remove the agent's access first, then REMOVE_OWNER_REVIEW=1 ./scripts/setup-repo.sh" >&2
  exit 2
fi

# Private repos on GitHub Free don't enforce rulesets or required checks (they need GitHub Pro or Team)
# and have no secret scanning. Warn before starting, so nothing looks protected when it isn't.
PRIVATE="$(gh api "repos/$REPO" --jq .private)"
PLAN="$(gh api "repos/$REPO" --jq '.owner.type' 2>/dev/null)"
if [[ "$PLAN" == "User" ]]; then PLAN="$(gh api user --jq '.plan.name // "unknown"' 2>/dev/null || echo unknown)"
else PLAN="$(gh api "orgs/$OWNER" --jq '.plan.name // "unknown"' 2>/dev/null || echo unknown)"; fi
if [[ "$PRIVATE" == "true" && "$PLAN" == "unknown" ]]; then
  echo "  ⚠ $REPO is private and its plan can't be read: on GitHub Free main can't be protected." >&2
fi
if [[ "$PRIVATE" == "true" && "$PLAN" == "free" ]]; then
  echo "  ⚠ $REPO is PRIVATE on GitHub Free: main can't be protected (no rulesets, no required checks)" >&2
  echo "    and secret scanning is off. The agent hook and the git hook still work locally." >&2
  echo "    To protect main: make the repo public or upgrade to GitHub Pro." >&2
fi

# 1. Git hooks that check every commit, message and push (the identity they expect is set in step 2d)
git config core.hooksPath .githooks
chmod +x .githooks/* .claude/hooks/*.sh scripts/*.sh

# 1b. Start the project's own history: the CHANGELOG and WORKLOG that come with the template describe
#     the template, not this project. Only on the first run (no .claude/TEMPLATE_VERSION yet) and
#     never in the template repo itself.
# First run: no .claude/TEMPLATE_VERSION yet (step 1b writes it). Later runs (to update the rulesets) must not
# touch the project's own files: its docs may name the PROJECT_NAME placeholder on purpose.
first_run=0; [[ -f .claude/TEMPLATE_VERSION ]] || first_run=1
if [[ "$NAME" != "project-template" ]] && (( first_run )); then
  awk '{ print } /^-->$/ { exit }' docs/WORKLOG.md > docs/WORKLOG.md.new && mv docs/WORKLOG.md.new docs/WORKLOG.md
  cat > CHANGELOG.md <<'MD'
# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioned with [SemVer](https://semver.org/).

## [Unreleased]
MD
  # The README is the template's showcase: the project starts from its own skeleton instead,
  # and the template's banner goes away.
  mv docs/templates/README.project.md README.md && rmdir docs/templates 2>/dev/null || true
  rm -f .github/assets/banner.svg && rmdir .github/assets 2>/dev/null || true
  echo "  ✓ Fresh CHANGELOG and WORKLOG for this project (the template's own history was removed)"
fi

# Steps 2 and 2b only make sense in a new project: in the template itself they would overwrite the
# PROJECT_NAME placeholders and the default mode.
if [[ "$NAME" != "project-template" ]]; then
  # 2. Replace the project name placeholder (not inside third-party skills, whose scripts use their own
  #    PROJECT_NAME variable, nor in the Spanish guide, which explains the placeholder)
  #    "|| true": on a second run nothing is left to replace, and grep finding nothing is not an error.
  #    NUL-separated: a file name with spaces stays one name. $NAME was checked above (no sed metacharacters).
  #    Only on the first run: by then every placeholder is replaced, and a later mention is the project's own.
  if (( first_run )); then
    { grep -rl --null --exclude-dir=.git --exclude-dir=skills --exclude=setup-repo.sh --exclude="test-*.sh" --exclude=README.es.md "PROJECT_NAME" . || true; } |
      xargs -0 -r sed -i.bak "s/PROJECT_NAME/$NAME/g"
    find . -name '*.bak' -not -path './.git/*' -delete
  fi
  # CODEOWNERS names the template's owner; in a new project the code owner is you, the person running this
  # (for an organisation's repo the org itself can't be a code owner, so it is never used).
  ME="$(gh api user --jq .login)"
  if [[ -n "$AGENT_BOT" && "$(lower "$AGENT_BOT")" == "$(lower "$ME")" ]]; then
    echo "AGENT_BOT must be a different account from yours ($ME): run this as the owner, not as the agent." >&2; exit 2
  fi
  old_login="$(sed -n 's/^login=//p' .github/OWNER 2>/dev/null | head -n 1)"
  [[ -n "$old_login" && -f .github/CODEOWNERS ]] && sed -i.bak "s/ @$old_login$/ @$ME/" .github/CODEOWNERS && rm -f .github/CODEOWNERS.bak

  # 2a. The owner (.github/OWNER), on the first run, when it still names the template's owner: the person running
  #     this. Name and email from OWNER_NAME / OWNER_EMAIL, else this repo's git identity, else GitHub's (the
  #     private noreply address, so no personal email ends up in the files). Later runs keep the file.
  if (( first_run )) && [[ "$(lower "$old_login")" != "$(lower "$ME")" ]]; then
    gh_id="$(gh api user --jq .id)"
    o_name="${OWNER_NAME:-$(git config --get user.name || true)}"
    [[ -n "$o_name" ]] || o_name="$(gh api user --jq '.name // empty' || true)"
    [[ -n "$o_name" ]] || o_name="$ME"
    o_noreply="$gh_id+$ME@users.noreply.github.com"
    o_email="${OWNER_EMAIL:-$(git config --get user.email || true)}"
    [[ -n "$o_email" ]] || o_email="$o_noreply"
    if [[ "$o_name" == *[$'\n\\=']* || ! "$o_email" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]]; then
      echo "The owner's name or email isn't usable ('$o_name' <$o_email>): set OWNER_NAME and OWNER_EMAIL." >&2; exit 2
    fi
    { sed -n '/^#/p' .github/OWNER 2>/dev/null | grep -v '^# GitHub' || true
      printf 'name=%s\nemail=%s\nlogin=%s\n' "$o_name" "$o_email" "$ME"
      echo "# GitHub's private address for commits made in its web UI (merges of PRs): Settings → Emails."
      printf 'noreply=%s\n' "$o_noreply"; } > .github/OWNER.new && mv .github/OWNER.new .github/OWNER
    # The project README's copyright line names the owner too.
    if [[ -f README.md ]] && grep -q OWNER_NAME README.md; then
      awk -v v="$o_name" '{ out = ""; while ((i = index($0, "OWNER_NAME")) > 0) { out = out substr($0, 1, i - 1) v; $0 = substr($0, i + 10) } print out $0 }' \
        README.md > README.md.new && mv README.md.new README.md
    fi
    echo "  ✓ Owner: $o_name <$o_email> (@$ME), in .github/OWNER"
  fi

  # 2b. Project mode: MODE=light ./scripts/setup-repo.sh for experiments and small tools (default: full).
  #     See AGENTS.md → Project mode.
  #     Light mode doesn't use the roadmap, phases or risk register, so they go: fewer files for the agent to
  #     read or keep up to date. Switching to full later brings them back from the template (AGENTS.md).
  if [[ "${MODE:-full}" == "light" ]]; then
    sed -i.bak 's/^- \*\*Mode:\*\* full/- **Mode:** light/' docs/STATE.md && rm -f docs/STATE.md.bak
    rm -rf docs/ROADMAP.md docs/RISKS.md docs/phases
    echo "  ✓ Light mode: VISION, STATE, WORKLOG and SETUP; ROADMAP, RISKS and phases removed"
  fi
fi

# 2d. Local commit authorship: the owner's identity, as .github/OWNER says (the hooks check commits against it).
own_name="$(sed -n 's/^name=//p' .github/OWNER 2>/dev/null | head -n 1)"
own_email="$(sed -n 's/^email=//p' .github/OWNER 2>/dev/null | head -n 1)"
if [[ -z "$own_name" || -z "$own_email" ]]; then
  echo ".github/OWNER is missing or has no name or email: the git hooks can't check authorship without it." >&2; exit 2
fi
git config user.name  "$own_name"
git config user.email "$own_email"

# 2e. The first run is over (its placeholders replaced): recorded only now, so a run stopped halfway is a first
#     run again next time instead of leaving PROJECT_NAME unreplaced for good.
if [[ "$NAME" != "project-template" ]] && (( first_run )); then
  echo "created from serbenda/project-template on $(date +%F)" > .claude/TEMPLATE_VERSION
fi

# 2f. Gitleaks: the pre-commit hook refuses every commit if it is missing (a secrets check that silently
#     doesn't run is worse than none). Warn now instead of at the first commit.
command -v gitleaks >/dev/null 2>&1 ||
  echo "  ⚠ gitleaks is not installed: commits will be refused until you run  brew install gitleaks" >&2
for tool in python3 jq; do
  command -v "$tool" >/dev/null 2>&1 ||
    echo "  ⚠ $tool is not installed: the Claude guard hook refuses every command until you install it" >&2
done

# 3. development branch
if ! git ls-remote --exit-code --heads origin development >/dev/null 2>&1; then
  git push origin "HEAD:refs/heads/development"
fi
git fetch origin development
if git rev-parse -q --verify refs/heads/development >/dev/null; then
  git switch development ||
    { echo "Could not switch to development (uncommitted changes in the way?): commit or stash them, then run this again." >&2; exit 2; }
else
  git switch -c development --track origin/development
fi

# What you asked for and couldn't be set: listed at the end, and the script fails.
failed=()
fail_step() { echo "  ✗ Could not set: $1" >&2; failed+=("$1"); }

# 4. Repo settings
#    delete_branch_on_merge=false: otherwise GitHub would delete development when merging the PR to main.
gh api -X PATCH "repos/$REPO" \
  -F delete_branch_on_merge=false \
  -F allow_merge_commit=true \
  -F allow_squash_merge=false \
  -F allow_rebase_merge=false \
  -F has_wiki=false >/dev/null || fail_step "merge settings (merge commits only, keep development)"

# 5. Security: Dependabot alerts, private vulnerability reporting,
#    secret scanning and push protection (free on public repos)
warn() { echo "  ⚠ Could not enable: $1 (check it by hand in Settings → Security)" >&2; }
gh api -X PUT "repos/$REPO/vulnerability-alerts" >/dev/null 2>&1 || warn "Dependabot alerts"
gh api -X PUT "repos/$REPO/automated-security-fixes" >/dev/null 2>&1 || warn "Dependabot automated security fixes"
gh api -X PUT "repos/$REPO/private-vulnerability-reporting" >/dev/null 2>&1 || warn "private vulnerability reporting"
if ! gh api -X PATCH "repos/$REPO" --input - >/dev/null 2>&1 <<'JSON'
{"security_and_analysis": {
  "secret_scanning": {"status": "enabled"},
  "secret_scanning_push_protection": {"status": "enabled"}
}}
JSON
then
  # Free on public repos, so a failure there is a failure; private ones need GitHub Advanced Security.
  if [[ "$PRIVATE" == "true" ]]; then warn "secret scanning and push protection (private repos require GitHub Advanced Security)"
  else fail_step "secret scanning and push protection"; fi
fi

# 6. Protect main with a ruleset: PR required, green CI, no force-push or deletion
#    Idempotent: if the ruleset already exists it is updated to this definition, so repos configured
#    with an older template also get the new required checks. If GitHub refuses it
#    (private repo on GitHub Free), the script goes on and warns at the end.
ruleset_exists() { [[ -n "$(ruleset_id "$1")" ]]; }
# apply_ruleset <name> <json>: creates it, or updates the existing one to this definition
apply_ruleset() {
  local id; id="$(ruleset_id "$1")"
  if [[ -n "$id" ]]; then printf '%s' "$2" | gh api -X PUT "repos/$REPO/rulesets/$id" --input - >/dev/null 2>&1
  else printf '%s' "$2" | gh api -X POST "repos/$REPO/rulesets" --input - >/dev/null 2>&1; fi
}
protect_main_json='{
  "name": "Protect main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}},
  "rules": [
    {"type": "deletion"},
    {"type": "non_fast_forward"},
    {"type": "pull_request", "parameters": {
      "required_approving_review_count": __REVIEWS__,
      "dismiss_stale_reviews_on_push": true,
      "require_code_owner_review": __CODE_OWNERS__,
      "require_last_push_approval": __CODE_OWNERS__,
      "required_review_thread_resolution": true
    }},
    {"type": "required_status_checks", "parameters": {
      "strict_required_status_checks_policy": true,
      "required_status_checks": [
        {"context": "Secrets", "integration_id": 15368},
        {"context": "Hook", "integration_id": 15368},
        {"context": "Authorship", "integration_id": 15368},
        {"context": "Records", "integration_id": 15368},
        {"context": "SAST", "integration_id": 15368},
        {"context": "Dependencies", "integration_id": 15368}
      ]
    }}
  ]
}'
# integration_id 15368 is GitHub Actions: only its check runs count, not a commit status anyone with write access
# can post under the same name.
# Without an agent account the owner opens the PRs, and GitHub doesn't let anyone approve their own PR, so no
# review can be required. With one, the agent opens them and the owner must approve as code owner.
if [[ -n "$AGENT_BOT" ]]; then reviews=1 code_owners=true; else reviews=0 code_owners=false; fi
protect_main_json="${protect_main_json//__REVIEWS__/$reviews}"
protect_main_json="${protect_main_json//__CODE_OWNERS__/$code_owners}"
protected=1
if apply_ruleset "Protect main" "$protect_main_json"; then
  echo "  ✓ main protected (PR, the six checks from GitHub Actions, no force-push or deletion; owner review: $code_owners)"
else
  protected=0
fi

# 6a. development can't be deleted or force-pushed, and tags are the owner's (repository admins), so an agent
#     with write access can't rewrite the work everyone builds on or cut a release.
if (( protected )); then
  apply_ruleset "Protect development" '{
  "name": "Protect development", "target": "branch", "enforcement": "active",
  "conditions": {"ref_name": {"include": ["refs/heads/development"], "exclude": []}},
  "rules": [{"type": "deletion"}, {"type": "non_fast_forward"}]
}' && echo "  ✓ development protected (no force-push or deletion)" || fail_step "'Protect development' ruleset"
  apply_ruleset "Protect tags" '{
  "name": "Protect tags", "target": "tag", "enforcement": "active",
  "conditions": {"ref_name": {"include": ["~ALL"], "exclude": []}},
  "bypass_actors": [{"actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always"}],
  "rules": [{"type": "creation"}, {"type": "update"}, {"type": "deletion"}]
}' && echo "  ✓ tags protected (only repository admins create, move or delete them)" || fail_step "'Protect tags' ruleset"
fi

# 6b. Optional: require signed commits (SIGNED_COMMITS=1 ./scripts/setup-repo.sh). Set up your signing key first:
#     docs/SECURITY_GUIDE.md → "Signing commits"
if [[ "${SIGNED_COMMITS:-0}" == "1" ]]; then
  if ruleset_exists "Signed commits"; then
    echo "  ✓ 'Signed commits' ruleset already exists"
  elif gh api -X POST "repos/$REPO/rulesets" --input - >/dev/null 2>&1 <<'JSON'
{"name": "Signed commits", "target": "branch", "enforcement": "active",
 "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH", "refs/heads/development"], "exclude": []}},
 "rules": [{"type": "required_signatures"}]}
JSON
  then
    echo "  ✓ Signed commits required on main and development"
  else
    fail_step "signed-commits ruleset"
  fi
fi

# 6c. Optional: the agent's own GitHub account (AGENT_BOT=<login>). Write access: it can push branches and open
#     PRs, never change settings, rulesets or secrets, approve, force-push or delete main or development, or touch
#     tags. A PR the owner approved can be merged by anyone with write access, the agent too: the approval is
#     the gate.
if [[ -n "$AGENT_BOT" ]]; then
  if gh api -X PUT "repos/$REPO/collaborators/$AGENT_BOT" -f permission=push >/dev/null 2>&1; then
    echo "  ✓ $AGENT_BOT invited with write access; PRs into main need your approval as code owner"
    echo "    Accept the invitation from that account, then follow docs/SECURITY_GUIDE.md → Agent identity."
  else
    fail_step "write access for $AGENT_BOT"
  fi
fi

# 7. Basic labels
for label in "bug:d73a4a" "enhancement:a2eeef" "docs:0075ca" "security:b60205" "dependencies:0366d6"; do
  gh label create "${label%%:*}" --color "${label##*:}" --repo "$REPO" --force >/dev/null
done

if (( protected == 0 )); then
  echo "" >&2
  echo "⚠ main is NOT protected: GitHub refused the ruleset (private repo on GitHub Free?)." >&2
  echo "  The rest is configured. Make the repo public or upgrade to GitHub Pro, then run this script again." >&2
  exit 1
fi
if (( ${#failed[@]} > 0 )); then
  echo "" >&2
  echo "⚠ Not everything was set up:" >&2
  printf '    %s\n' "${failed[@]}" >&2
  echo "  Fix the cause (permissions, plan) and run this script again (with the same variables)." >&2
  exit 1
fi

echo "✓ Done. Work on 'development' and open a PR to 'main'."
echo "  Review the changes (git status, git diff). They touch guardrail files (.claude/TEMPLATE_VERSION, .github/),"
echo "  so you, the owner, commit them:  git add -A && GUARDRAILS_OWNER_CHANGE=1 git commit -m \"chore: set up from the template\""
echo "  The first PR with code needs a worklog entry (docs/WORKLOG.md starts empty)."
