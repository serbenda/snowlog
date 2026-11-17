#!/usr/bin/env bash
# Tests for the git hooks in .githooks/: each case makes a commit in a throwaway repo and checks
# whether it is accepted (0) or refused (non-zero).
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
failures=0
# $TMPDIR, not the system temp folder: the Claude Code sandbox only lets commands write there.
tmp="$(mktemp -d "${TMPDIR:-/tmp}/test-githooks.XXXXXX")" || { echo "✗ could not create a temp dir" >&2; exit 1; }
trap 'rm -rf "$tmp"' EXIT

# A PATH without gitleaks, to test the "not installed" case wherever it runs.
nogl="$tmp/bin"; mkdir -p "$nogl"
for tool in git bash sh env grep sed awk printf cat mkdir rm tr head command dirname basename; do
  p="$(command -v "$tool" 2>/dev/null)" && [[ "$p" == /* ]] && ln -sf "$p" "$nogl/$tool"
done

new_repo() {  # new_repo -> prints the path of a new repo with the hooks enabled and one commit
  local d; d="$(mktemp -d "$tmp/repo.XXXXXX")" || exit 1
  {
    git init -q -b development "$d"
    git -C "$d" config user.name "Sergio Santiago Bendaña Quesada"
    git -C "$d" config user.email "serbenda@gmail.com"
    mkdir -p "$d/.githooks" "$d/.github" && cp "$root/.githooks/"* "$d/.githooks/"
    printf 'name=Sergio Santiago Bendaña Quesada\nemail=serbenda@gmail.com\nlogin=serbenda\n' > "$d/.github/OWNER"
    echo base > "$d/README.md"
    git -C "$d" add -A && git -C "$d" -c core.hooksPath=/dev/null commit -qm "chore: base"
    git -C "$d" config core.hooksPath .githooks
  } >/dev/null 2>&1 || { echo "✗ could not set up a test repo" >&2; exit 1; }
  echo "$d"
}
check() {  # check <expected: 0|1> <description> <repo> [env…] -- <commit message>
  local expected="$1" desc="$2" repo="$3" actual; shift 3
  local envs=(); while [[ "$1" != "--" ]]; do envs+=("$1"); shift; done; shift
  # Safety: only ever commit inside a throwaway repo under $tmp, never in this repository.
  if [[ "$repo" != "$tmp"/* || ! -d "$repo/.git" || "$repo" == *$'\n'* ]]; then
    echo "✗ refusing to commit outside the test's temp dir: $repo" >&2; exit 1
  fi
  (cd "$repo" && env "${envs[@]+"${envs[@]}"}" git commit -q -m "$1" >/dev/null 2>&1)
  actual=$?; [[ "$actual" != 0 ]] && actual=1
  if [[ "$actual" == "$expected" ]]; then echo "  ok    [$actual] $desc"
  else echo "  FAIL  [$actual, expected $expected] $desc"; failures=$((failures + 1)); fi
}
have_gitleaks=0; command -v gitleaks >/dev/null 2>&1 && have_gitleaks=1
# In CI every case must run: a hook test that silently skips half its cases would pass for the wrong reason.
if (( ! have_gitleaks )) && [[ -n "${CI:-}" ]]; then echo "✗ gitleaks is required in CI" >&2; exit 1; fi
safe() {  # safe <repo>: stop unless it is a throwaway repo inside $tmp
  [[ "$1" == "$tmp"/* && -d "$1/.git" && "$1" != *$'\n'* ]] || { echo "✗ unsafe test repo path: $1" >&2; exit 1; }
}
merge_check() {  # merge_check <expected> <description> <repo> [env…]: merge the branch "side" into development
  local expected="$1" desc="$2" repo="$3" actual; shift 3
  safe "$repo"
  (cd "$repo" && env "$@" git merge --no-ff -q -m "Merge side" side >/dev/null 2>&1)
  actual=$?; [[ "$actual" != 0 ]] && actual=1
  (( actual )) && (cd "$repo" && git merge --abort >/dev/null 2>&1 || true)
  if [[ "$actual" == "$expected" ]]; then echo "  ok    [$actual] $desc"
  else echo "  FAIL  [$actual, expected $expected] $desc"; failures=$((failures + 1)); fi
}

echo "the layers name the same guardrails:"
# The git hooks, the Claude guard, the sandbox's denyWrite and CODEOWNERS each list the guardrail paths; a name
# missing from one of them is a gap the others don't show.
prot_line() { grep -m1 "^protected='" "$1"; }
if [[ "$(prot_line "$root/.githooks/pre-commit")" == "$(prot_line "$root/.githooks/pre-push")" ]]; then echo "  ok    pre-commit and pre-push use the same paths"
else echo "  FAIL  pre-commit and pre-push use different paths"; failures=$((failures + 1)); fi
guard_files="$(grep -m1 "^protected_files_re=" "$root/.claude/hooks/guard.sh")"
for n in .claude AGENTS.md CLAUDE.md CLAUDE.local.md .mcp.json .githooks .github .devcontainer .semgrep .scanners .gitattributes .gitleaks .semgrepignore osv-scanner.toml \
         .vscode/ .code-workspace .envrc .husky .pre-commit-config.yaml setup-repo sync-from-template check-records \
         test-guard test-check-records test-githooks test-scripts; do
  esc="$(printf '%s' "$n" | sed 's/\./\\./g')"
  miss=""
  grep -qF -- "$esc" <<< "$(prot_line "$root/.githooks/pre-commit")" || miss="$miss git-hooks"
  grep -qF -- "$esc" <<< "$guard_files" || miss="$miss guard"
  case "$n" in setup-repo|sync-from-template|check-records|test-*) cn="/scripts/" ;; .vscode/) cn=".vscode/settings.json" ;; *) cn="$n" ;; esac
  grep -qF -- "$cn" "$root/.github/CODEOWNERS" || miss="$miss CODEOWNERS"
  if [[ -z "$miss" ]]; then echo "  ok    $n is a guardrail in every layer"
  else echo "  FAIL  $n is missing from:$miss"; failures=$((failures + 1)); fi
done

echo "pre-commit, guardrails:"
r=$(new_repo) || exit 1; safe "$r"; mkdir -p "$r/.github/workflows"; echo "on: push" > "$r/.github/workflows/ci.yml"; git -C "$r" add -A
check 1 "commit touching .github/ is refused" "$r" PATH="$PATH" -- "ci: change"
r=$(new_repo) || exit 1; safe "$r"; mkdir -p "$r/scripts"; echo x > "$r/scripts/check-records.sh"; git -C "$r" add -A
check 1 "commit touching an enforcement script is refused" "$r" PATH="$PATH" -- "chore: change"
r=$(new_repo) || exit 1; safe "$r"; mkdir -p "$r/.claude/hooks"; echo x > "$r/.claude/hooks/guard.sh"; git -C "$r" add .claude
check 1 "commit touching .claude/hooks is refused" "$r" PATH="$PATH" -- "chore: change"

r=$(new_repo) || exit 1; safe "$r"; mkdir -p "$r/.devcontainer"; echo "FROM x" > "$r/.devcontainer/Dockerfile"; git -C "$r" add -A
check 1 "commit touching .devcontainer/ is refused" "$r" PATH="$PATH" -- "chore: change"
r=$(new_repo) || exit 1; safe "$r"; mkdir -p "$r/.scanners/semgrep"; echo "FROM x" > "$r/.scanners/semgrep/Dockerfile"; git -C "$r" add -A
check 1 "commit touching .scanners/ is refused" "$r" PATH="$PATH" -- "chore: change"
r=$(new_repo) || exit 1; safe "$r"; echo '{"image":"x"}' > "$r/.devcontainer.json"; git -C "$r" add -A
check 1 "commit adding a root .devcontainer.json is refused" "$r" PATH="$PATH" -- "chore: change"

r=$(new_repo) || exit 1; safe "$r"; ln -s /tmp "$r/.github"; git -C "$r" add .github
check 1 "protected directory replaced by a symlink is refused" "$r" PATH="$PATH" -- "chore: link"
for f in .gitleaksignore .gitleaks.toml .semgrepignore osv-scanner.toml .mcp.json .claude/rules/r.md .claude/CLAUDE.md .GitHub/workflows/x.yml \
         .gitattributes src/.gitattributes sub/osv-scanner.toml sub/.gitleaksignore sub/.gitleaks.toml \
         .vscode/tasks.json .envrc .husky/pre-commit .pre-commit-config.yaml app/.vscode/settings.json app/.envrc \
         x.code-workspace AGENTS.md CLAUDE.md CLAUDE.local.md app/AGENTS.md src/CLAUDE.md; do
  r=$(new_repo) || exit 1; safe "$r"; mkdir -p "$r/$(dirname "$f")"; echo x > "$r/$f"; git -C "$r" add -f -- "$f"
  check 1 "commit adding $f is refused" "$r" PATH="$PATH" -- "chore: change"
done
r=$(new_repo) || exit 1; safe "$r"; printf 'eval(x)  # nosemgrep\n' > "$r/a.py"; git -C "$r" add -A
check 1 "commit adding an inline nosemgrep is refused" "$r" PATH="$PATH" -- "chore: change"
for line in 'x = 1 # nosem' '++i; // nosemgrep' 'nosemgrep: r' 'eval(x)  # NOSEMGREP: rule' 'osv-scanner:ignore'; do
  r=$(new_repo) || exit 1; safe "$r"; printf '%s\n' "$line" > "$r/a.js"; git -C "$r" add -A
  check 1 "commit adding a suppression refused: $line" "$r" PATH="$PATH" -- "chore: change"
done

echo "pre-merge-commit and pre-applypatch:"
if (( have_gitleaks )); then
  r=$(new_repo) || exit 1; safe "$r"
  ( cd "$r" && git switch -q -c side && mkdir -p .github && echo "on: push" > .github/ci.yml && git add -A &&
    GUARDRAILS_OWNER_CHANGE=1 git commit -q -m "ci: side change" && git switch -q development &&
    echo other > other.md && git add -A && git commit -q -m "docs: other" ) >/dev/null 2>&1
  merge_check 0 "a merge bringing the other side's guardrail change (not its own) is accepted" "$r" PATH="$PATH"
  # A merge that changes a guardrail file itself (beyond what the merge brings) is refused
  r=$(new_repo) || exit 1; safe "$r"
  ( cd "$r" && git switch -q -c side && echo s > s.md && git add -A && git commit -q -m "docs: side" &&
    git switch -q development && echo other > other.md && git add -A && git commit -q -m "docs: other" &&
    git merge -q --no-ff --no-commit side && mkdir -p .github && echo "on: push" > .github/ci.yml && git add -A ) >/dev/null 2>&1
  safe "$r"; (cd "$r" && git commit -q -m "Merge side" >/dev/null 2>&1); actual=$?; [[ "$actual" != 0 ]] && actual=1
  if [[ "$actual" == 1 ]]; then echo "  ok    [1] a merge adding its own guardrail change is refused"
  else echo "  FAIL  [$actual, expected 1] a merge adding its own guardrail change is refused"; failures=$((failures + 1)); fi
  (cd "$r" && GUARDRAILS_OWNER_CHANGE=1 git commit -q -m "Merge side" >/dev/null 2>&1); actual=$?; [[ "$actual" != 0 ]] && actual=1
  if [[ "$actual" == 0 ]]; then echo "  ok    [0] the owner commits that merge with the switch"
  else echo "  FAIL  [$actual, expected 0] the owner commits that merge with the switch"; failures=$((failures + 1)); fi

  # pre-applypatch: a patch bringing a guardrail change through git am
  r=$(new_repo) || exit 1; safe "$r"
  ( cd "$r" && git switch -q -c side && mkdir -p .github && echo "on: push" > .github/ci.yml && git add -A &&
    GUARDRAILS_OWNER_CHANGE=1 git commit -q -m "ci: side change" && git format-patch -q -1 -o "$r/../patch-$$" &&
    git switch -q development ) >/dev/null 2>&1
  for expected in 1 0; do
    safe "$r"
    if (( expected )); then envs=(PATH="$PATH"); desc="git am of a guardrail change is refused"
    else envs=(PATH="$PATH" GUARDRAILS_OWNER_CHANGE=1); desc="the owner can apply it with the switch"; fi
    (cd "$r" && env "${envs[@]}" git am -q "$r/../patch-$$"/*.patch >/dev/null 2>&1)
    actual=$?; [[ "$actual" != 0 ]] && actual=1
    (( actual )) && (cd "$r" && git am --abort >/dev/null 2>&1 || true)
    if [[ "$actual" == "$expected" ]]; then echo "  ok    [$actual] $desc"
    else echo "  FAIL  [$actual, expected $expected] $desc"; failures=$((failures + 1)); fi
  done
else
  echo "  skip  needs gitleaks"
fi

echo "commit-msg and applypatch-msg:"
if (( have_gitleaks )); then
  for msg in $'feat: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>' $'feat: x\n\n  Co-authored-by: Alice <a@example.com>' \
             $'feat: x\n\nGenerated with **Claude Code**' $'feat: x\n\n🤖 done' "random words, not conventional" \
             $'feat: x\n\n# Generated with Claude Code' $'feat: x\n\n> Co-Authored-By: Claude <c@x>' \
             $'feat: x\n\n- Generated with Claude Opus 5.5' $'feat: x\n\nWritten by [Codex](https://example.com)' \
             $'feat: x\n\nGenerated with Claude Code v2.0.31' $'feat: x\n\nAssisted-by: Claude:claude-opus-4' \
             $'feat: x\n\nGenerated with GitHub Copilot' $'feat: x\n\nGenerated-by: ChatGPT-4o' \
             $'feat: x\n\nhttps://claude.com/claude-code' $'feat: x\n\nWritten with Cursor in mind, so the paths are relative.' \
             $'feat: x\n\n# ------------------------ >8 ------------------------\nCo-authored-by: Claude <noreply@anthropic.com>' \
             $'feat: x\n\n# ------------------------ >8 ------------------------\n- Co-Authored-By: Claude <c@x>' \
             $'feat: x\n\nSigned-off-by: Claude <claude@anthropic.com>' $'feat: x\n\nSession: https://claude.ai/code/session_01abc'; do
    r=$(new_repo) || exit 1; safe "$r"; echo hi > "$r/notes.md"; git -C "$r" add -A
    check 1 "message refused: ${msg//$'\n'/ ⏎ }" "$r" PATH="$PATH" -- "$msg"
  done
  for msg in $'docs: notes\n\nOutput generated by codex-based parser was wrong before.' "fix(api)!: drop v1" "Revert \"feat: x\"" \
             $'docs: notes\n\nThe fix for what Copilot review flagged was written by hand.' \
             $'docs: notes\n\nThe paths were written with Cursor in mind.' "Feat(ui): x" \
             $'docs: notes\n\nSee https://claude.com/claude-code for the docs.' $'docs: notes\n\nBuilt with Claude API for the summarizer.' \
             $'docs: notes\n\nGenerated by openai-codegen from the spec.' $'docs: notes\n\nhttps://claude.com/claude-code/hooks' \
             "Initial commit" "Squashed commit of the following:"; do
    r=$(new_repo) || exit 1; safe "$r"; echo hi > "$r/notes.md"; git -C "$r" add -A
    check 0 "message accepted: ${msg//$'\n'/ ⏎ }" "$r" PATH="$PATH" -- "$msg"
  done
  # commit -v: the diff below the scissors line is not the message (here it adds a line with 🤖)
  r=$(new_repo) || exit 1; safe "$r"; echo '🤖 robot notes' > "$r/notes.md"; git -C "$r" add -A
  safe "$r"; (cd "$r" && GIT_EDITOR=true git commit -q -v -e -m "docs: robot notes" >/dev/null 2>&1); actual=$?; [[ "$actual" != 0 ]] && actual=1
  if [[ "$actual" == 0 ]]; then echo "  ok    [0] commit -v: the diff below the scissors is not checked as the message"
  else echo "  FAIL  [$actual, expected 0] commit -v: the diff below the scissors is not checked as the message"; failures=$((failures + 1)); fi
  # core.commentChar other than #: the scissors line and git's comments use it
  r=$(new_repo) || exit 1; safe "$r"
  (cd "$r" && echo 'Co-Authored-By: someone' > n.md && git add -A && git -c core.hooksPath=/dev/null commit -q -m "docs: n" &&
    echo plain > n.md && git add -A) >/dev/null 2>&1
  safe "$r"; (cd "$r" && GIT_EDITOR=true git -c core.commentChar=';' commit -q -v -e -m "docs: drop notes" >/dev/null 2>&1); actual=$?; [[ "$actual" != 0 ]] && actual=1
  if [[ "$actual" == 0 ]]; then echo "  ok    [0] commit -v with core.commentChar=';': the diff is not the message"
  else echo "  FAIL  [$actual, expected 0] commit -v with core.commentChar=';': the diff is not the message"; failures=$((failures + 1)); fi
  # A secret in the message itself
  tok="ghp_""aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5"   # split, so this file holds no token
  r=$(new_repo) || exit 1; safe "$r"; echo hi > "$r/notes.md"; git -C "$r" add -A
  check 1 "a secret in the commit message is refused" "$r" PATH="$PATH" -- "docs: notes"$'\n\n'"token = \"$tok\""
  r=$(new_repo) || exit 1; safe "$r"; echo hi > "$r/notes.md"; git -C "$r" add -A
  check 0 "author email in another case accepted" "$r" PATH="$PATH" GIT_AUTHOR_EMAIL=Serbenda@Gmail.com -- "docs: notes"
  # git am of someone else's patch: applypatch-msg checks the author
  r=$(new_repo) || exit 1; safe "$r"
  ( cd "$r" && git switch -q -c side && echo j > j.md && git add -A &&
    GIT_AUTHOR_EMAIL=jane@example.com GIT_AUTHOR_NAME=Jane git -c core.hooksPath=/dev/null commit -q -m "feat: jane" &&
    git format-patch -q -1 -o "$r/../jane-$$" && git switch -q development ) >/dev/null 2>&1
  safe "$r"; (cd "$r" && git am -q "$r/../jane-$$"/*.patch >/dev/null 2>&1); actual=$?; [[ "$actual" != 0 ]] && actual=1
  (( actual )) && (cd "$r" && git am --abort >/dev/null 2>&1 || true)
  if [[ "$actual" == 1 ]]; then echo "  ok    [1] git am of a patch by someone else is refused"
  else echo "  FAIL  [$actual, expected 1] git am of a patch by someone else is refused"; failures=$((failures + 1)); fi
  # git am of the owner's own patch, email in another case
  r=$(new_repo) || exit 1; safe "$r"
  ( cd "$r" && git switch -q -c side && echo k > k.md && git add -A &&
    GIT_AUTHOR_EMAIL=Serbenda@Gmail.com git -c core.hooksPath=/dev/null commit -q -m "docs: k" &&
    git format-patch -q -1 -o "$r/../own-$$" && git switch -q development ) >/dev/null 2>&1
  safe "$r"; (cd "$r" && git am -q "$r/../own-$$"/*.patch >/dev/null 2>&1); actual=$?; [[ "$actual" != 0 ]] && actual=1
  (( actual )) && (cd "$r" && git am --abort >/dev/null 2>&1 || true)
  if [[ "$actual" == 0 ]]; then echo "  ok    [0] git am of the owner's patch (email in another case) is accepted"
  else echo "  FAIL  [$actual, expected 0] git am of the owner's patch (email in another case) is accepted"; failures=$((failures + 1)); fi
else
  echo "  skip  needs gitleaks"
fi

echo "pre-push:"
if (( have_gitleaks )); then
push_check() {  # push_check <expected> <description> <repo> <git push arguments…>
  local expected="$1" desc="$2" repo="$3" actual; shift 3
  safe "$repo"
  (cd "$repo" && git push -q "$@" >/dev/null 2>&1)
  actual=$?; [[ "$actual" != 0 ]] && actual=1
  if [[ "$actual" == "$expected" ]]; then echo "  ok    [$actual] $desc"
  else echo "  FAIL  [$actual, expected $expected] $desc"; failures=$((failures + 1)); fi
}
r=$(new_repo) || exit 1; safe "$r"
remote="$tmp/remote.git"
{ git init -q --bare "$remote" && git -C "$r" remote add origin "$remote"; } >/dev/null 2>&1 || { echo "✗ could not set up a test remote" >&2; exit 1; }
# The first push carries the hooks themselves (guardrail files): the owner's, with the switch.
push_check 1 "first push of the hooks (guardrail files) refused without the switch" "$r" origin development
(cd "$r" && GUARDRAILS_OWNER_CHANGE=1 git push -q origin development) >/dev/null 2>&1 || { echo "✗ could not push the base" >&2; exit 1; }
(cd "$r" && echo d > d.md && git add -A && git -c core.hooksPath=/dev/null commit -q -m "docs: d") >/dev/null 2>&1
push_check 0 "push of development accepted" "$r" origin development
push_check 1 "push to main refused" "$r" origin development:main
push_check 1 "push to master refused" "$r" origin HEAD:refs/heads/master
(cd "$r" && git -c core.hooksPath=/dev/null commit -q --amend -m "chore: rewritten" >/dev/null 2>&1)
push_check 1 "force push refused" "$r" --force origin development
push_check 0 "new work branch accepted" "$r" origin development:feat/x
push_check 0 "deleting a work branch accepted" "$r" origin :feat/x
push_check 1 "deleting development refused" "$r" origin :development
(cd "$r" && git tag v0.1 >/dev/null 2>&1)
push_check 1 "pushing a tag refused" "$r" origin v0.1
push_check 1 "pushing to refs/notes refused" "$r" origin HEAD:refs/notes/x
(cd "$r" && git switch -q -c feat/y && echo j > j.md && git add -A &&
  GIT_AUTHOR_EMAIL=jane@example.com git -c core.hooksPath=/dev/null commit -q -m "feat: jane") >/dev/null 2>&1
push_check 1 "push of a commit by someone else refused" "$r" origin feat/y
(cd "$r" && git -c core.hooksPath=/dev/null commit -q --amend --reset-author -m $'feat: y\n\nCo-Authored-By: Claude <noreply@anthropic.com>') >/dev/null 2>&1
push_check 1 "push of a commit with an AI signature refused" "$r" origin feat/y
(cd "$r" && git -c core.hooksPath=/dev/null commit -q --amend --reset-author -m "feat: y") >/dev/null 2>&1
push_check 0 "push of the owner's clean commit accepted" "$r" origin feat/y
push_check 1 "push to Main (another case) refused" "$r" origin HEAD:refs/heads/Main
push_check 0 "push by URL accepted" "$r" "$remote" feat/y:feat/y2
nohooks() { safe "$1"; (cd "$1" && shift && git -c core.hooksPath=/dev/null "$@") >/dev/null 2>&1; }
(cd "$r" && git switch -q -c feat/z && echo z > z.md && git add -A &&
  GIT_COMMITTER_EMAIL=bot@example.com git -c core.hooksPath=/dev/null commit -q -m "feat: z") >/dev/null 2>&1
push_check 1 "push of a commit committed by someone else refused" "$r" origin feat/z
push_check 1 "one bad ref refuses the whole push" "$r" origin feat/y:feat/y3 feat/z:feat/z
# A forged remote-tracking ref must not hide a commit from the check
nohooks "$r" update-ref refs/remotes/origin/zzz feat/z
push_check 1 "a forged remote-tracking ref doesn't hide a commit" "$r" origin feat/z:feat/z2
nohooks "$r" update-ref -d refs/remotes/origin/zzz
# git replace must not show other data than what is sent
nohooks "$r" replace feat/z feat/y
push_check 1 "git replace doesn't hide a commit" "$r" origin feat/z:feat/z3
nohooks "$r" replace -d "$(git -C "$r" rev-parse feat/z)"
# A guardrail change made with plumbing (no pre-commit) is refused at push, unless the owner pushes it
(cd "$r" && git switch -q feat/y && mkdir -p .githooks && echo "exit 0" > .githooks/pre-push.x && git add -A &&
  git -c core.hooksPath=/dev/null commit -q -m "chore: sneak") >/dev/null 2>&1
push_check 1 "a guardrail change that skipped pre-commit is refused at push" "$r" origin feat/y:chore/sneak
safe "$r"; (cd "$r" && GUARDRAILS_OWNER_CHANGE=1 git push -q origin feat/y:chore/owner >/dev/null 2>&1); actual=$?; [[ "$actual" != 0 ]] && actual=1
if [[ "$actual" == 0 ]]; then echo "  ok    [0] the owner pushes it with the switch"
else echo "  FAIL  [$actual, expected 0] the owner pushes it with the switch"; failures=$((failures + 1)); fi
# Back-merge of main: GitHub's merges there (owner's noreply address) are on the remote already, so not checked
other="$tmp/other"
{ git clone -q -b development "$remote" "$other" && git -C "$other" switch -q -c main &&
  echo m > "$other/m.md" && git -C "$other" add -A &&
  GIT_COMMITTER_EMAIL=noreply@github.com git -C "$other" -c user.email=57532210+serbenda@users.noreply.github.com -c user.name=x \
    -c core.hooksPath=/dev/null commit -q -m "Merge pull request #1" &&
  git -C "$other" -c core.hooksPath=/dev/null push -q --no-verify origin main; } >/dev/null 2>&1 || { echo "✗ could not set up main" >&2; exit 1; }
(cd "$r" && git switch -q development && git fetch -q origin && git reset -q --hard origin/development &&
  git -c core.hooksPath=/dev/null merge -q --no-ff -m "Merge origin/main into development" origin/main) >/dev/null 2>&1
# main moves on after the fetch: the hook fetches the tip it hasn't got, so the merged commits still count as known
{ echo m2 > "$other/m2.md" && git -C "$other" add -A &&
  GIT_COMMITTER_EMAIL=noreply@github.com git -C "$other" -c user.email=57532210+serbenda@users.noreply.github.com -c user.name=x \
    -c core.hooksPath=/dev/null commit -q -m "Merge pull request #2" &&
  git -C "$other" -c core.hooksPath=/dev/null push -q --no-verify origin main; } >/dev/null 2>&1 || { echo "✗ could not move main" >&2; exit 1; }
push_check 0 "back-merge of origin/main (GitHub's commits) accepted, also with main moved on since the fetch" "$r" origin development
# refs/pull/* is anyone's PR: a commit only there is checked like any other
(cd "$r" && git switch -q -c feat/pr && echo p > p.md && git add -A &&
  GIT_AUTHOR_EMAIL=evil@example.com git -c core.hooksPath=/dev/null commit -q -m "feat: p" &&
  git -c core.hooksPath=/dev/null push -q --no-verify origin feat/pr:refs/pull/7/head) >/dev/null 2>&1
push_check 1 "a commit that is only on refs/pull/* is still checked" "$r" origin feat/pr:feat/pr
# A merge made with plumbing that takes an old guardrail file from one parent: that is the merge's own change
L=$(git -C "$r" rev-parse feat/y); M0=$(git -C "$r" rev-parse feat/y^)
C=$(git -C "$r" commit-tree "$M0^{tree}" -p "$L" -p "$M0" -m "Merge old into feat/y")
push_check 1 "a merge taking an old guardrail file from a parent is refused" "$r" origin "$C:refs/heads/feat/rev"
# Secrets and suppressions in commits that skipped pre-commit
tok="ghp_""aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5"   # split, so this file holds no token
(cd "$r" && git switch -q development && git switch -q -c feat/leak && printf 'token = "%s" # gitleaks:allow\n' "$tok" > leak.py &&
  git add -A && git -c core.hooksPath=/dev/null commit -q -m "feat: leak") >/dev/null 2>&1
push_check 1 "a secret marked gitleaks:allow, committed without the hooks, is refused at push" "$r" origin feat/leak
(cd "$r" && git switch -q development && git switch -q -c feat/bin && printf 'token = "%s"\n\0' "$tok" > leak.dat &&
  git add -A && git -c core.hooksPath=/dev/null commit -q -m "feat: bin") >/dev/null 2>&1
push_check 1 "a secret in a binary file (NUL byte), committed without the hooks, is refused at push" "$r" origin feat/bin
(cd "$r" && git switch -q development && git switch -q -c feat/sem && echo 'eval(x)  # nosemgrep' > s.py &&
  git add -A && git -c core.hooksPath=/dev/null commit -q -m "feat: sem") >/dev/null 2>&1
push_check 1 "a nosemgrep committed without the hooks is refused at push" "$r" origin feat/sem
safe "$r"; (cd "$r" && GUARDRAILS_OWNER_CHANGE=1 git push -q origin feat/sem >/dev/null 2>&1); actual=$?; [[ "$actual" != 0 ]] && actual=1
if [[ "$actual" == 0 ]]; then echo "  ok    [0] the owner pushes it with the switch"
else echo "  FAIL  [$actual, expected 0] the owner pushes it with the switch"; failures=$((failures + 1)); fi
push_check 0 "a dependabot/ branch can be deleted" "$r" origin development:refs/heads/dependabot/npm/x
push_check 0 "  (deleting it)" "$r" origin :dependabot/npm/x
# Secrets in a commit message or a branch name
(cd "$r" && git switch -q development && git switch -q -c feat/msg && echo m > msg.md && git add -A &&
  git -c core.hooksPath=/dev/null commit -q -m "docs: m" -m "token = \"$tok\"") >/dev/null 2>&1
push_check 1 "a secret in a commit message, committed without the hooks, is refused at push" "$r" origin feat/msg
push_check 1 "a secret in the branch name is refused" "$r" origin "development:refs/heads/feat/$tok"
# A merge driver in the local config makes git merge-tree agree with any result: what differs from both parents counts
(cd "$r" && git switch -q development && git switch -q -c feat/da && mkdir -p .githooks && echo a > .githooks/extra && git add -A &&
  git -c core.hooksPath=/dev/null commit -q -m "chore: a" && git switch -q development && git switch -q -c feat/db &&
  mkdir -p .githooks && echo b > .githooks/extra && git add -A && git -c core.hooksPath=/dev/null commit -q -m "chore: b" &&
  GUARDRAILS_OWNER_CHANGE=1 git push -q origin feat/da feat/db && git switch -q feat/da &&
  echo '.githooks/extra merge=evil' > .git/info/attributes &&
  git -c core.hooksPath=/dev/null -c merge.evil.driver="printf 'EVIL\n' > %A" merge -q --no-ff -m "Merge feat/db" feat/db) >/dev/null 2>&1
push_check 1 "a merge whose guardrail file differs from both parents (a merge driver) is refused" "$r" origin feat/da:feat/dm
rm -f "$r/.git/info/attributes"
push_check 1 "main can't be created where the remote already has branches, even by the owner" "$r" origin development:main
# A new, empty repository: only the owner creates main, once
empty="$tmp/empty.git"; git init -q --bare "$empty" >/dev/null 2>&1
r2=$(new_repo) || exit 1; safe "$r2"
push_check 1 "creating main in an empty repository is refused without the switch" "$r2" "$empty" development:main
safe "$r2"; (cd "$r2" && GUARDRAILS_OWNER_CHANGE=1 git push -q "$empty" development:main >/dev/null 2>&1); actual=$?; [[ "$actual" != 0 ]] && actual=1
if [[ "$actual" == 0 ]]; then echo "  ok    [0] the owner creates main there with the switch"
else echo "  FAIL  [$actual, expected 0] the owner creates main there with the switch"; failures=$((failures + 1)); fi
else
  echo "  skip  needs gitleaks"
fi

echo "pre-commit, gitleaks:"
r=$(new_repo) || exit 1; safe "$r"; echo hi > "$r/notes.md"; git -C "$r" add -A
check 1 "refused when gitleaks is not installed" "$r" PATH="$nogl" -- "docs: notes"
if (( have_gitleaks )); then
  r=$(new_repo) || exit 1; safe "$r"; echo hi > "$r/notes.md"; git -C "$r" add -A
  check 0 "clean commit accepted" "$r" PATH="$PATH" -- "docs: notes"
  r=$(new_repo) || exit 1; safe "$r"; mkdir -p "$r/.github"; echo "on: push" > "$r/.github/x.yml"; git -C "$r" add -A
  check 0 "owner commits a guardrail change with the switch" "$r" PATH="$PATH" GUARDRAILS_OWNER_CHANGE=1 -- "ci: owner change"
  r=$(new_repo) || exit 1; safe "$r"; printf 'token = "ghp_%s"\n' "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5" > "$r/config.env"; git -C "$r" add -A
  check 1 "commit with a GitHub token refused" "$r" PATH="$PATH" -- "chore: config"
  tok="ghp_""aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5"   # split, so this file holds no token
  r=$(new_repo) || exit 1; safe "$r"; printf 'token = "%s" # gitleaks:allow\n' "$tok" > "$r/a.py"; git -C "$r" add -A
  check 1 "a secret marked gitleaks:allow is refused (the marker is ignored)" "$r" PATH="$PATH" -- "chore: config"
  r=$(new_repo) || exit 1; safe "$r"; printf 'token = "%s" <!-- gitleaks:allow -->\n' "$tok" > "$r/doc.md"; git -C "$r" add -A
  check 1 "a secret marked gitleaks:allow in Markdown is refused" "$r" PATH="$PATH" -- "docs: notes"
  r=$(new_repo) || exit 1; safe "$r"; printf 'token = "%s"\n\0' "$tok" > "$r/leak.dat"; git -C "$r" add -A
  check 1 "a secret in a binary file (NUL byte) is refused" "$r" PATH="$PATH" -- "chore: data"
  r=$(new_repo) || exit 1; safe "$r"; mkdir -p "$r/.git/info"; echo '* -diff' > "$r/.git/info/attributes"
  printf 'token = "%s"\n' "$tok" > "$r/config.env"; git -C "$r" add -A
  check 1 "a secret in a file that .git/info/attributes marks -diff is refused" "$r" PATH="$PATH" -- "chore: config"
  for f in node_modules/p/i.js package-lock.json; do
    r=$(new_repo) || exit 1; safe "$r"; mkdir -p "$r/$(dirname "$f")"; printf 'token = "%s"\n' "$tok" > "$r/$f"; git -C "$r" add -f -- "$f"
    check 1 "a secret in $f (a path gitleaks skips by default) is refused" "$r" PATH="$PATH" -- "chore: deps"
  done
  r=$(new_repo) || exit 1; safe "$r"; echo 'int nosemaphore = 1;' > "$r/a.c"; echo 'Use nosemgrep only with a reason.' > "$r/notes.txt"
  echo 'x = 1  # gitleaks:allow' > "$r/b.py"; git -C "$r" add -A
  check 0 "nosemaphore, prose about nosemgrep in .txt and an inert gitleaks:allow are accepted" "$r" PATH="$PATH" -- "chore: misc"
  r=$(new_repo) || exit 1; safe "$r"; printf '[allowlist]\nregexes = ["ghp_"]\n' > "$r/../allow-$$.toml"
  printf 'token = "%s"\n' "$tok" > "$r/config.env"; git -C "$r" add -A
  check 1 "GITLEAKS_CONFIG in the environment doesn't switch the scan off" "$r" PATH="$PATH" GITLEAKS_CONFIG="$r/../allow-$$.toml" -- "chore: config"
  r=$(new_repo) || exit 1; safe "$r"; printf 'x = 1  # \0 nosemgrep\n' > "$r/a.py"; git -C "$r" add -A
  check 1 "a nosemgrep after a NUL byte is still seen" "$r" PATH="$PATH" -- "chore: nul"
  r=$(new_repo) || exit 1; safe "$r"; mkdir -p "$r/.vscode"; echo '{"recommendations":[]}' > "$r/.vscode/extensions.json"; git -C "$r" add -A
  check 0 ".vscode/extensions.json (only recommends extensions) is not a guardrail" "$r" PATH="$PATH" -- "chore: extensions"
  r=$(new_repo) || exit 1; safe "$r"; echo hi > "$r/notes.md"; git -C "$r" add -A
  check 1 "wrong author refused (commit-msg)" "$r" PATH="$PATH" GIT_AUTHOR_EMAIL=someone@example.com -- "docs: notes"
  # The owner comes from .github/OWNER as last committed: a changed copy on disk doesn't make someone else the owner.
  r=$(new_repo) || exit 1; safe "$r"; printf 'name=Eve\nemail=eve@example.com\nlogin=eve\n' > "$r/.github/OWNER"
  echo hi > "$r/notes.md"; git -C "$r" add notes.md
  check 1 "an uncommitted .github/OWNER doesn't change the owner" "$r" PATH="$PATH" GIT_AUTHOR_EMAIL=eve@example.com -- "docs: notes"
  r=$(new_repo) || exit 1; safe "$r"; git -C "$r" rm -q .github/OWNER >/dev/null 2>&1
  git -C "$r" -c core.hooksPath=/dev/null commit -qm "chore: no owner" >/dev/null 2>&1; echo hi > "$r/notes.md"; git -C "$r" add notes.md
  check 1 "no .github/OWNER: every commit refused" "$r" PATH="$PATH" -- "docs: notes"
else
  echo "  skip  gitleaks not installed here: accepted-commit cases skipped (the refusal case above ran)"
fi

echo
if (( failures == 0 )); then echo "✓ All git hook tests pass."; exit 0
else echo "✗ $failures git hook tests fail."; exit 1; fi
