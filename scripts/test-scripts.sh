#!/usr/bin/env bash
# Tests for scripts/setup-repo.sh and scripts/sync-from-template.sh. Each case runs the real script on a
# throwaway copy of the template, inside $TMPDIR, with a fake `gh` that records the GitHub API calls instead
# of making them. Nothing here touches this repository or GitHub.
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
failures=0
# $TMPDIR, not the system temp folder: the Claude Code sandbox only lets commands write there.
tmp="$(mktemp -d "${TMPDIR:-/tmp}/test-scripts.XXXXXX")" || { echo "✗ could not create a temp dir" >&2; exit 1; }
trap '[[ -n "${KEEP:-}" ]] || rm -rf "$tmp"' EXIT
# setup-repo pushes through the project's own pre-push hook, which refuses every push without gitleaks.
command -v gitleaks >/dev/null 2>&1 || { echo "✗ gitleaks is required (setup-repo pushes through the pre-push hook)" >&2; exit 1; }

ok()   { echo "  ok    $1"; }
fail() { echo "  FAIL  $1"; failures=$((failures + 1)); }
expect() { if eval "$2"; then ok "$1"; else fail "$1"; fi; }   # expect <description> <test expression>
safe() { [[ "$1" == "$tmp"/* && "$1" != *$'\n'* ]] || { echo "✗ unsafe test path: $1" >&2; exit 1; }; }

# copy_template <dir>: the template's files as they are on disk (tracked and untracked, not ignored), no .git
copy_template() {
  safe "$1"; mkdir -p "$1"
  (cd "$root" && git ls-files -co --exclude-standard -z | xargs -0 tar cf -) | (cd "$1" && tar xf -) ||
    { echo "✗ could not copy the template" >&2; exit 1; }
}
# git_repo <dir> <branch>: make <dir> a git repo with one commit (hooks off for the setup commit)
git_repo() {
  { git init -q -b "$2" "$1" && git -C "$1" config user.name "Sergio Santiago Bendaña Quesada" &&
    git -C "$1" config user.email "serbenda@gmail.com" && git -C "$1" add -A &&
    git -C "$1" -c core.hooksPath=/dev/null commit -qm "chore: base"; } >/dev/null 2>&1 ||
    { echo "✗ could not create a test repo in $1" >&2; exit 1; }
}

# --- Fake gh: logs every call (arguments and stdin) and answers like GitHub would ---------------------
bin="$tmp/bin"; mkdir -p "$bin"
cat > "$bin/gh" <<'GH'
#!/usr/bin/env bash
# FAKE_GH_DIR holds the log and the answers. FAKE_PRIVATE / FAKE_PLAN shape the repo; FAKE_RULESET_FAIL=1 makes
# GitHub refuse the ruleset (a private repo on GitHub Free).
log="$FAKE_GH_DIR/calls.log"
input=""; [[ " $* " == *" --input - "* ]] && input="$(cat)"
printf '%s\n' "gh $*" >> "$log"; [[ -n "$input" ]] && printf '%s\n' "$input" >> "$log"
case "$*" in
  "repo view --json nameWithOwner -q .nameWithOwner") echo "owner/my-app" ;;
  *"--jq .private"*) echo "${FAKE_PRIVATE:-false}" ;;
  *"--jq .owner.type"*) echo "User" ;;
  *"--jq .permissions.admin"*) echo "${FAKE_ADMIN:-true}" ;;
  *"--jq .default_branch"*) echo "${FAKE_DEFAULT_BRANCH:-main}" ;;
  "api user --jq .login") echo "${FAKE_LOGIN:-owner}" ;;
  "api user --jq .id") echo 1234 ;;
  "api user --jq .name // empty") echo "${FAKE_NAME:-}" ;;
  "api user --jq"*) echo "${FAKE_PLAN:-pro}" ;;
  *"/rulesets?includes_parents=false --jq"*)   # the id of the ruleset the jq filter names, if created
    n="$(printf '%s' "$*" | sed -n 's/.*\.name == "\([^"]*\)".*/\1/p')"
    [[ -f "$FAKE_GH_DIR/ruleset-$n" ]] && cat "$FAKE_GH_DIR/ruleset-$n" ;;
  *"/rulesets/"*" --jq"*) cat "$FAKE_GH_DIR/code-owners" 2>/dev/null || echo false ;;
  "api -X POST"*"/rulesets --input -")
    [[ "${FAKE_RULESET_FAIL:-0}" == 1 ]] && exit 1
    n="$(printf '%s' "$input" | sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' | head -n 1)"
    case "$n" in "Protect main") echo 42 ;; "Protect development") echo 43 ;; *) echo 44 ;; esac > "$FAKE_GH_DIR/ruleset-$n"
    [[ "$n" == "Protect main" ]] && { grep -q '"require_code_owner_review": true' <<< "$input" && echo true || echo false; } > "$FAKE_GH_DIR/code-owners" ;;
  "api -X PUT"*"/rulesets/"*" --input -")
    [[ "${FAKE_RULESET_FAIL:-0}" == 1 ]] && exit 1
    if grep -q '"name": "Protect main"' <<< "$input"; then
      { grep -q '"require_code_owner_review": true' <<< "$input" && echo true || echo false; } > "$FAKE_GH_DIR/code-owners"
    fi ;;
  *"collaborators/"*) [[ "${FAKE_INVITE_FAIL:-0}" == 1 ]] && exit 1 ;;
esac
exit 0
GH
chmod +x "$bin/gh"

# new_project <name>: a fresh project created from the template, with an origin to push to
new_project() {
  local d="$tmp/$1"
  copy_template "$d"; git_repo "$d" main
  { git init -q --bare "$tmp/$1.git" && git -C "$d" remote add origin "$tmp/$1.git" &&
    git -C "$d" -c core.hooksPath=/dev/null push -q origin main; } >/dev/null 2>&1 || { echo "✗ remote setup failed" >&2; exit 1; }
  mkdir -p "$tmp/$1.gh"
  echo "$d"
}
# run_setup <project dir> [VAR=value…] -- [setup-repo arguments…]: runs it with the fake gh, sets $status
run_setup() {
  local d="$1"; shift; local envs=(); while [[ "$1" != "--" ]]; do envs+=("$1"); shift; done; shift
  safe "$d"
  (cd "$d" && env PATH="$bin:$PATH" FAKE_GH_DIR="$d.gh" "${envs[@]+"${envs[@]}"}" "$BASH" scripts/setup-repo.sh "$@" >"$d.out" 2>&1)
  status=$?
}
# finished_ok <project dir>: the run succeeded; if not, the end of its output, so CI shows why.
finished_ok() {
  if [[ $status == 0 ]]; then ok "finishes with exit 0"; else fail "finishes with exit 0"; sed 's/^/      | /' "$1.out" | tail -n 15; fi
}

echo "setup-repo.sh, a new project (full mode):"
p=$(new_project my-app) || exit 1
run_setup "$p" -- owner/my-app
finished_ok "$p"
expect "sets the owner identity and the git hooks path" \
  '[[ "$(git -C "$p" config user.email)" == serbenda@gmail.com && "$(git -C "$p" config core.hooksPath)" == .githooks ]]'
expect "writes .github/OWNER for the person running it (this repo's git identity, GitHub's noreply)" \
  'grep -qx "login=owner" "$p/.github/OWNER" && grep -qx "email=serbenda@gmail.com" "$p/.github/OWNER" && grep -qx "noreply=1234+owner@users.noreply.github.com" "$p/.github/OWNER"'
expect "names the owner in the project README" 'grep -q "© Sergio Santiago Bendaña Quesada" "$p/README.md" && ! grep -q OWNER_NAME "$p/README.md"'
expect "replaces PROJECT_NAME in the docs" \
  '! grep -rq --exclude-dir=.git --exclude-dir=skills --exclude=setup-repo.sh --exclude=README.es.md --exclude="test-*.sh" PROJECT_NAME "$p" && grep -q my-app "$p/docs/VISION.md"'
expect "starts an empty worklog (only the template comment)" '! grep -q "^## 20" "$p/docs/WORKLOG.md" && grep -q "^-->" "$p/docs/WORKLOG.md"'
expect "starts an empty CHANGELOG" '[[ "$(grep -c "^## " "$p/CHANGELOG.md")" == 1 ]]'
expect "the README is the project skeleton, without the template banner" \
  '! grep -q banner.svg "$p/README.md" && [[ ! -e "$p/.github/assets/banner.svg" && ! -e "$p/docs/templates" ]]'
expect "records where it came from in .claude/TEMPLATE_VERSION" 'grep -q "created from serbenda/project-template" "$p/.claude/TEMPLATE_VERSION"'
expect "leaves full mode as the default" 'grep -q "^- \*\*Mode:\*\* full" "$p/docs/STATE.md"'
expect "pushes and switches to development" \
  'git --git-dir="$p.git" rev-parse --verify -q refs/heads/development >/dev/null && [[ "$(git -C "$p" branch --show-current)" == development ]]'
expect "disables squash merges and keeps development after a merge" \
  'grep -q "allow_squash_merge=false" "$p.gh/calls.log" && grep -q "delete_branch_on_merge=false" "$p.gh/calls.log"'
expect "creates the ruleset: strict, six required checks" \
  'grep -q "\"strict_required_status_checks_policy\": true" "$p.gh/calls.log" && [[ "$(grep -cE "\{\"context\": \"(Secrets|Hook|Authorship|Records|SAST|Dependencies)\", \"integration_id\": 15368\}" "$p.gh/calls.log")" == 6 ]]'
expect "protects development and tags too" \
  'grep -q "\"name\": \"Protect development\"" "$p.gh/calls.log" && grep -q "\"name\": \"Protect tags\"" "$p.gh/calls.log"'
expect "tells the owner to commit the setup changes with the switch" 'grep -q "GUARDRAILS_OWNER_CHANGE=1 git commit" "$p.out"'
expect "leaves no .bak files behind" '[[ -z "$(find "$p" -name "*.bak" -not -path "*/.git/*")" ]]'
expect "no agent account: no review required (the owner can't approve their own PR)" \
  'grep -q "\"required_approving_review_count\": 0" "$p.gh/calls.log" && grep -q "\"require_code_owner_review\": false" "$p.gh/calls.log"'
expect "CODEOWNERS names this repository's owner" '[[ "$(grep -c " @owner$" "$p/.github/CODEOWNERS")" == "$(grep -c " @serbenda$" "$root/.github/CODEOWNERS")" ]] && ! grep -q " @serbenda$" "$p/.github/CODEOWNERS"'

echo "setup-repo.sh, run a second time:"
printf '\n## 2026-01-01 — First change\n- Explains the PROJECT_NAME placeholder.\n' >> "$p/docs/WORKLOG.md"
run_setup "$p" -- owner/my-app
finished_ok "$p"
expect "keeps the project's own worklog" 'grep -q "First change" "$p/docs/WORKLOG.md"'
expect "leaves the project's own mentions of PROJECT_NAME alone" 'grep -q "Explains the PROJECT_NAME placeholder" "$p/docs/WORKLOG.md"'
expect "updates the existing ruleset instead of creating another" 'grep -q "api -X PUT repos/owner/my-app/rulesets/42 --input -" "$p.gh/calls.log"'

echo "setup-repo.sh, light mode:"
p=$(new_project light-app) || exit 1
run_setup "$p" MODE=light "OWNER_NAME=Ada Owner" OWNER_EMAIL=ada@example.com -- owner/light-app
finished_ok "$p"
expect "sets Mode: light in STATE" 'grep -q "^- \*\*Mode:\*\* light" "$p/docs/STATE.md"'
expect "removes the docs light mode doesn't use (ROADMAP, RISKS, phases)" '[[ ! -e "$p/docs/ROADMAP.md" && ! -e "$p/docs/RISKS.md" && ! -e "$p/docs/phases" ]]'
expect "keeps the ones it uses" '[[ -f "$p/docs/VISION.md" && -f "$p/docs/SETUP.md" && -f "$p/docs/THREAT_MODEL.md" && -f "$p/docs/WORKLOG.md" ]]'
expect "OWNER_NAME and OWNER_EMAIL set the owner and the git identity" \
  'grep -qx "email=ada@example.com" "$p/.github/OWNER" && grep -qx "name=Ada Owner" "$p/.github/OWNER" && [[ "$(git -C "$p" config user.email)" == ada@example.com ]]'

echo "setup-repo.sh, with an agent account (AGENT_BOT):"
p=$(new_project bot-app) || exit 1
run_setup "$p" AGENT_BOT=owner-agent -- owner/bot-app
finished_ok "$p"
expect "gives the agent account write access, nothing more" 'grep -q "api -X PUT repos/owner/bot-app/collaborators/owner-agent -f permission=push" "$p.gh/calls.log"'
expect "PRs into main need the owner's approval as code owner" \
  'grep -q "\"required_approving_review_count\": 1" "$p.gh/calls.log" && grep -q "\"require_code_owner_review\": true" "$p.gh/calls.log" && grep -q "\"require_last_push_approval\": true" "$p.gh/calls.log"'
run_setup "$p" -- owner/bot-app
expect "a second run without AGENT_BOT is refused (it would drop the owner's review)" \
  '[[ $status == 2 ]] && ! grep -q "\"require_code_owner_review\": false" "$p.gh/calls.log"'
run_setup "$p" REMOVE_OWNER_REVIEW=1 -- owner/bot-app
expect "…unless the owner asks for it (REMOVE_OWNER_REVIEW=1)" '[[ $status == 0 ]] && grep -q "\"require_code_owner_review\": false" "$p.gh/calls.log"'
p=$(new_project invite-fails) || exit 1
run_setup "$p" AGENT_BOT=owner-agent FAKE_INVITE_FAIL=1 -- owner/invite-fails
expect "fails when the agent account can't be given access" '[[ $status == 1 ]] && grep -q "Not everything was set up" "$p.out"'
p=$(new_project bad-name) || exit 1
run_setup "$p" -- "owner/we/ird"
expect "refuses a repository name that isn't owner/name, before changing anything" '[[ $status == 2 && ! -e "$p/.claude/TEMPLATE_VERSION" ]]'
run_setup "$p" FAKE_ADMIN=false -- owner/bad-name
expect "refuses without admin rights, before changing anything" '[[ $status == 2 && ! -e "$p/.claude/TEMPLATE_VERSION" ]]'
run_setup "$p" FAKE_DEFAULT_BRANCH=trunk -- owner/bad-name
expect "refuses a default branch other than main" '[[ $status == 2 && ! -e "$p/.claude/TEMPLATE_VERSION" ]]'
p=$(new_project bad-bot) || exit 1
run_setup "$p" "AGENT_BOT=x; rm -rf /" -- owner/bad-bot
expect "refuses an AGENT_BOT that isn't a login" '[[ $status == 2 ]] && [[ ! -s "$p.gh/calls.log" ]]'
run_setup "$p" AGENT_BOT=Owner -- owner/bad-bot
expect "refuses the owner's own account as the agent account (any case)" '[[ $status == 2 ]]'
p=$(new_project org-app) || exit 1
run_setup "$p" FAKE_LOGIN=alice AGENT_BOT=alice -- some-org/org-app
expect "refuses the person running setup as the agent account" '[[ $status == 2 ]]'
run_setup "$p" FAKE_LOGIN=alice -- some-org/org-app
expect "in an organisation's repo, the code owner is the person running setup" '[[ $status == 0 ]] && grep -q "^\*  *@alice$" "$p/.github/CODEOWNERS"'

echo "setup-repo.sh, private repo on GitHub Free:"
p=$(new_project private-app) || exit 1
run_setup "$p" FAKE_PRIVATE=true FAKE_PLAN=free FAKE_RULESET_FAIL=1 -- owner/private-app
expect "fails, so main is not taken for protected" '[[ $status == 1 ]]'
expect "says main is NOT protected" 'grep -q "main is NOT protected" "$p.out"'

echo "setup-repo.sh, in the template itself:"
p=$(new_project project-template) || exit 1
run_setup "$p" -- owner/project-template
expect "keeps the template's .github/OWNER" 'cmp -s "$root/.github/OWNER" "$p/.github/OWNER"'
expect "keeps the template's placeholders, history and README" \
  'grep -q PROJECT_NAME "$p/docs/VISION.md" && grep -q "^## 20" "$p/docs/WORKLOG.md" && grep -q banner.svg "$p/README.md"'

# --- sync-from-template.sh --------------------------------------------------------------------------
# A committed copy of the template (sync refuses to --apply uncommitted template files), and an "old" project.
tpl="$tmp/tpl"; copy_template "$tpl"; git_repo "$tpl" main
old_project() {  # old_project <name>: a project on development whose guard is outdated and settings customised
  local d="$tmp/$1"; copy_template "$d"
  echo "# old guard" > "$d/.claude/hooks/guard.sh"; echo '{"custom": true}' > "$d/.claude/settings.json"
  git_repo "$d" development; echo "$d"
}
run_sync() {  # run_sync <project> [mode]: runs the copy's sync, sets $status
  safe "$1"; ("$BASH" "$tpl/scripts/sync-from-template.sh" "$@" >"$1.out" 2>&1); status=$?
}

echo "sync-from-template.sh:"
p=$(old_project proj) || exit 1
run_sync "$p"
expect "a report changes nothing" '[[ $status == 0 && -z "$(git -C "$p" status --porcelain)" ]] && grep -q "CHANGED  .claude/hooks/guard.sh" "$p.out"'
run_sync "$p" --apply
expect "--apply replaces the template-owned files" '[[ $status == 0 ]] && cmp -s "$tpl/.claude/hooks/guard.sh" "$p/.claude/hooks/guard.sh"'
expect "--apply never overwrites the files each project adapts" 'grep -q custom "$p/.claude/settings.json"'
expect "--apply records the template version" '[[ -s "$p/.claude/TEMPLATE_VERSION" ]]'

p=$(old_project no-owner) || exit 1; git -C "$p" rm -q .github/OWNER >/dev/null 2>&1
git -C "$p" -c core.hooksPath=/dev/null commit -qm "chore: before OWNER" >/dev/null 2>&1
run_sync "$p" --apply
expect "--apply gives a project from before .github/OWNER the template's (the hooks need one)" 'cmp -s "$tpl/.github/OWNER" "$p/.github/OWNER"'
p=$(old_project own-owner) || exit 1; printf 'name=Ada\nemail=ada@example.com\nlogin=ada\n' > "$p/.github/OWNER"
git -C "$p" add -A >/dev/null 2>&1; git -C "$p" -c core.hooksPath=/dev/null commit -qm "chore: owner" >/dev/null 2>&1
run_sync "$p" --apply
expect "--apply never replaces a project's own .github/OWNER" 'grep -qx "login=ada" "$p/.github/OWNER"'

p=$(old_project moved) || exit 1
mkdir -p "$p/.github/scanners/semgrep"; echo "FROM x" > "$p/.github/scanners/semgrep/Dockerfile"
echo 'directories: ["/.github/scanners/*"]' >> "$p/.github/dependabot.yml"; git -C "$p" add -A >/dev/null 2>&1
git -C "$p" -c core.hooksPath=/dev/null commit -qm "chore: old scanners" >/dev/null 2>&1
run_sync "$p"
expect "reports the old .github/scanners/ and the files that still read it" \
  'grep -q "^  .github/scanners$" "$p.out" && grep -q "still reads .github/scanners" "$p.out"'
rm -rf "$p/.github/scanners"; git -C "$p" add -A >/dev/null 2>&1
git -C "$p" -c core.hooksPath=/dev/null commit -qm "chore: folder gone" >/dev/null 2>&1
run_sync "$p"
expect "…and warns about the old paths even once the folder is gone" 'grep -q "still reads .github/scanners" "$p.out"'

p=$(old_project on-main) || exit 1; git -C "$p" branch -qm development main
run_sync "$p" --apply
expect "--apply on main is refused" '[[ $status == 1 ]] && grep -q "# old guard" "$p/.claude/hooks/guard.sh"'

p=$(old_project dirty) || exit 1; echo change >> "$p/docs/STATE.md"
run_sync "$p" --apply
expect "--apply with uncommitted project changes is refused" '[[ $status == 1 ]] && grep -q "# old guard" "$p/.claude/hooks/guard.sh"'

p=$(old_project link) || exit 1
# Planted on a path late in the owned list: only the check before copying stops it before guard.sh is replaced.
outside="$tmp/outside"; mkdir -p "$outside/semgrep"; echo "keep" > "$outside/semgrep/Dockerfile"
rm -rf "$p/.scanners"; ln -s "$outside" "$p/.scanners"; git -C "$p" add -A >/dev/null 2>&1
git -C "$p" -c core.hooksPath=/dev/null commit -qm "chore: link" >/dev/null 2>&1
run_sync "$p" --apply
expect "--apply refuses to write through a symlink" '[[ $status == 1 && "$(cat "$outside/semgrep/Dockerfile")" == keep ]]'
expect "…and copies nothing at all when it refuses" '[[ -z "$(git -C "$p" status --porcelain)" ]] && grep -q "# old guard" "$p/.claude/hooks/guard.sh"'

p=$(old_project detached) || exit 1; git -C "$p" switch -q --detach
run_sync "$p" --apply
expect "--apply on a detached HEAD is refused" '[[ $status == 1 ]] && grep -q "# old guard" "$p/.claude/hooks/guard.sh"'

p=$(old_project tpl-dirty) || exit 1; echo "# unreviewed" >> "$tpl/.claude/hooks/guard.sh"
run_sync "$p" --apply
expect "--apply with uncommitted template changes is refused" '[[ $status == 1 ]] && grep -q "# old guard" "$p/.claude/hooks/guard.sh"'
git -C "$tpl" checkout -q -- .claude/hooks/guard.sh

run_sync "$p" --bogus
expect "an unknown option is refused" '[[ $status == 2 ]]'

p=$(old_project hardlink) || exit 1
outside="$tmp/outside-file"; echo "keep" > "$outside"; rm -f "$p/.githooks/commit-msg"; ln "$outside" "$p/.githooks/commit-msg"
git -C "$p" add -A >/dev/null 2>&1; git -C "$p" -c core.hooksPath=/dev/null commit -qm "chore: hardlink" >/dev/null 2>&1
run_sync "$p" --apply
expect "--apply replaces a hard-linked file instead of writing through it" \
  '[[ $status == 0 && "$(cat "$outside")" == keep ]] && cmp -s "$tpl/.githooks/commit-msg" "$p/.githooks/commit-msg"'

p=$(old_project tpl-branch) || exit 1; git -C "$tpl" switch -q -c feat/unreviewed
run_sync "$p" --apply
expect "--apply from a template branch other than main (no tag) is refused" '[[ $status == 1 ]] && grep -q "# old guard" "$p/.claude/hooks/guard.sh"'
git -C "$tpl" switch -q main

p=$(old_project ignored) || exit 1; echo "scripts/test-guard.sh" >> "$p/.gitignore"; git -C "$p" rm -q --cached scripts/test-guard.sh
git -C "$p" add -A >/dev/null 2>&1; git -C "$p" -c core.hooksPath=/dev/null commit -qm "chore: ignore" >/dev/null 2>&1
run_sync "$p" --apply
expect "--apply refuses when the project ignores a template-owned file" '[[ $status == 1 ]] && grep -q "# old guard" "$p/.claude/hooks/guard.sh"'

p=$(old_project via-link) || exit 1; ln -s "$tpl" "$tmp/tpl-alias"
("$BASH" "$tpl/scripts/sync-from-template.sh" "$tmp/tpl-alias" --apply >"$p.out" 2>&1); status=$?
expect "a symlink to the template is taken for the template itself" '[[ $status == 2 && ! -e "$tpl/.claude/TEMPLATE_VERSION" ]]'

echo
if (( failures == 0 )); then echo "✓ All script tests pass."; exit 0
else echo "✗ $failures script tests fail."; exit 1; fi
