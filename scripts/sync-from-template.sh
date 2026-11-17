#!/usr/bin/env bash
# Brings the template's improvements into a project created from an older version of it.
# Run it from the template repo, pointing at the project. Dry run by default: it changes nothing
# until you pass --apply, and even then it only replaces the files the template owns.
#
# Usage: scripts/sync-from-template.sh <path-to-project>            report what would change
#        scripts/sync-from-template.sh <path-to-project> --diff     ...and show the full diffs
#        scripts/sync-from-template.sh <path-to-project> --apply    replace the template-owned files
#
# After --apply: review `git diff` in the project, merge the "review" files by hand,
# add a worklog entry and commit on a branch (never on main).
# --apply only copies from the template's reviewed state: its main (equal to origin/main) or a tag.
set -euo pipefail

template="$(cd "$(dirname "$0")/.." && pwd -P)"
target="${1:-}"
mode="${2:-report}"
usage() { echo "Usage: $0 <path-to-project> [--diff|--apply]" >&2; exit 2; }
[[ -z "$target" || ! -d "$target" ]] && usage
[[ "$mode" =~ ^(report|--diff|--apply)$ ]] || usage
target="$(cd "$target" && pwd -P)"   # -P: a symlink to the template is the template
[[ "$target" == "$template" ]] && { echo "The target is the template itself." >&2; exit 2; }

# git in the project with its own config's command hooks off: core.fsmonitor and hooks there would run here.
tgit() { git -C "$target" -c core.fsmonitor=false -c core.hooksPath=/dev/null "$@"; }
tgit rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "$target is not a git repo." >&2; exit 2; }
branch="$(tgit branch --show-current)"
if [[ "$mode" == "--apply" ]]; then
  [[ -z "$branch" ]] && { echo "The project is on a detached HEAD: switch to development or a branch first." >&2; exit 1; }
  [[ "$branch" =~ ^(main|master)$ ]] && { echo "The project is on $branch: switch to development or a branch first." >&2; exit 1; }
  [[ -n "$(tgit status --porcelain)" ]] && { echo "The project has uncommitted changes: commit or stash them first." >&2; exit 1; }
  # Only reviewed, committed template files are copied into a project: its main as on origin, or a tag.
  [[ -n "$(git -C "$template" status --porcelain)" ]] && { echo "The template has uncommitted changes: commit them (or stash them) before --apply." >&2; exit 1; }
  thead="$(git -C "$template" rev-parse HEAD)"
  if ! git -C "$template" describe --exact-match --tags HEAD >/dev/null 2>&1; then
    [[ "$(git -C "$template" branch --show-current)" == main ]] ||
      { echo "The template is not on main or a tag: only its reviewed state is copied (git switch main)." >&2; exit 1; }
    if origin_main="$(git -C "$template" rev-parse -q --verify refs/remotes/origin/main)" && [[ "$origin_main" != "$thead" ]]; then
      echo "The template's main differs from origin/main: git pull (or push) it first." >&2; exit 1
    fi
  fi
fi

# linked <root> <relative path>: true if the path or any directory on the way to it is a symlink under <root>
linked() {
  local p="$1" part rest="$2"
  while [[ -n "$rest" ]]; do
    part="${rest%%/*}"; [[ "$rest" == */* ]] && rest="${rest#*/}" || rest=""
    p="$p/$part"
    [[ -L "$p" ]] && return 0
  done
  return 1
}
# no_symlink <relative path>: refuse if it is linked in the project, so --apply can never write outside it (a
# planted .claude/hooks -> ~/somewhere would redirect cp).
no_symlink() {
  if linked "$target" "$1"; then echo "✗ $target/$1 goes through a symlink: refusing to write through it. Remove it and run again." >&2; exit 1; fi
}

# Files the template owns: replaced as a whole on --apply. Projects should not customise them.
owned=(
  .claude/hooks/guard.sh
  .claude/skills/record-changes/SKILL.md
  .githooks/commit-msg
  .githooks/pre-commit
  .githooks/pre-merge-commit
  .githooks/pre-push
  .githooks/pre-applypatch
  .githooks/applypatch-msg
  scripts/test-guard.sh
  scripts/check-records.sh
  scripts/test-check-records.sh
  scripts/test-githooks.sh
  scripts/test-scripts.sh
  .github/pull_request_template.md
  .scanners/semgrep/Dockerfile
  .scanners/osv-scanner/Dockerfile
  scripts/sync-from-template.sh
)
while IFS= read -r f; do owned+=("$f"); done < <(cd "$template" && ls .claude/commands/*.md .claude/agents/*.md)

# Files projects usually adapt (permissions for their stack, CI jobs, rules): only reported, never copied.
review=(
  .claude/settings.json
  .github/workflows/ci.yml
  .github/dependabot.yml
  AGENTS.md
  CLAUDE.md
  docs/DEFINITION_OF_DONE.md
  docs/SETUP.md
  scripts/setup-repo.sh
  .github/CODEOWNERS
  .github/workflows/devcontainer.yml
  .devcontainer/Dockerfile
  .devcontainer/devcontainer.json
)

# Files from the older, Spanish version of the template, now renamed.
legacy=(
  .claude/hooks/guardia.sh scripts/test-guardia.sh
  .claude/commands/estado.md .claude/commands/nueva-fase.md .claude/commands/cerrar-fase.md .claude/commands/preparar-pr.md
  .claude/agents/revisor-seguridad.md .claude/agents/revisor-dod.md .claude/agents/revisor-arquitectura.md
  .claude/skills/registro-cambios
  .github/scanners
)

version="$(git -C "$template" rev-parse --short HEAD)"
echo "→ Template $version → $target (branch: ${branch:-?})"
[[ "$mode" != "--apply" && -n "$(git -C "$template" status --porcelain)" ]] && echo "  ⚠ The template has uncommitted changes: this report compares the files as they are on disk."
[[ -f "$target/.claude/TEMPLATE_VERSION" ]] && echo "  Project was last synced from: $(cat "$target/.claude/TEMPLATE_VERSION")"

# Before copying anything: no symlink anywhere on the way to a file that --apply writes, in the project or in
# the template (a committed link would copy whatever it points to), and no owned file the project's .gitignore
# hides (its replacement would never show in git status).
if [[ "$mode" == "--apply" ]]; then
  for f in "${owned[@]}" .claude/TEMPLATE_VERSION; do no_symlink "$f"; done
  for f in "${owned[@]}"; do
    if linked "$template" "$f" || [[ ! -f "$template/$f" ]]; then
      echo "✗ the template's $f is not a regular file: refusing to copy it." >&2; exit 1
    fi
    if tgit check-ignore -q --no-index -- "$f" 2>/dev/null; then
      echo "✗ $f is ignored by the project's .gitignore: its replacement wouldn't show in git status. Unignore it first." >&2; exit 1
    fi
  done
fi

changes=0
echo; echo "Template-owned files (replaced with --apply):"
for f in "${owned[@]}"; do
  if linked "$target" "$f"; then state="LINKED"   # never read through a link (it would print what it points to)
  elif [[ ! -e "$target/$f" ]]; then state="NEW"
  elif cmp -s "$template/$f" "$target/$f"; then state="same"
  else state="CHANGED"; fi
  [[ "$state" == "same" ]] && continue
  changes=$((changes + 1))
  printf '  %-8s %s\n' "$state" "$f"
  [[ "$mode" == "--diff" && "$state" == "CHANGED" ]] && diff -u "$target/$f" "$template/$f" | sed 's/^/      /' || true
  if [[ "$mode" == "--apply" ]]; then
    no_symlink "$f"
    mkdir -p "$(dirname "$target/$f")"
    # A new file moved into place: a hard link at the destination is replaced, never written through.
    cp "$template/$f" "$target/$f.sync-tmp.$$"
    [[ "$f" == *.sh || "$f" == .githooks/* ]] && chmod +x "$target/$f.sync-tmp.$$"
    mv -f "$target/$f.sync-tmp.$$" "$target/$f"
  fi
done
(( changes == 0 )) && echo "  (all up to date)"

# .github/OWNER is the project's own (who may commit), never replaced. A project from before it existed gets
# the template's with --apply, since the git hooks copied above refuse every commit without one: edit it if
# the project's owner is someone else (name, email, login, noreply), and commit it with the rest.
if [[ ! -e "$target/.github/OWNER" && -f "$template/.github/OWNER" ]]; then
  echo; echo "  NEW      .github/OWNER   (the owner's identity, which the git hooks now read: check it names this project's owner)"
  if [[ "$mode" == "--apply" ]]; then
    no_symlink .github/OWNER
    mkdir -p "$target/.github"
    cp "$template/.github/OWNER" "$target/.github/OWNER.sync-tmp.$$" && mv -f "$target/.github/OWNER.sync-tmp.$$" "$target/.github/OWNER"
  fi
fi

echo; echo "Files to merge by hand (never copied):"
pending=0
for f in "${review[@]}"; do
  [[ -e "$template/$f" ]] || continue
  if linked "$target" "$f"; then echo "  LINKED   $f   (a symlink in the project: check it by hand)"; pending=$((pending + 1))
  elif [[ ! -e "$target/$f" ]]; then echo "  MISSING  $f   → cp \"$template/$f\" \"$target/$f\""; pending=$((pending + 1))
  elif ! cmp -s "$template/$f" "$target/$f"; then
    echo "  DIFFERS  $f   → diff -u \"$target/$f\" \"$template/$f\""; pending=$((pending + 1))
    [[ "$mode" == "--diff" ]] && { diff -u "$target/$f" "$template/$f" | sed 's/^/      /' || true; }
  fi
done
(( pending == 0 )) && echo "  (nothing to merge)"

found=()
for f in "${legacy[@]}"; do [[ -e "$target/$f" ]] && found+=("$f"); done
if (( ${#found[@]} > 0 )); then
  echo; echo "Files the template no longer uses (renamed or moved since): remove them once the new ones are in place:"
  printf '  %s\n' "${found[@]}"
  if grep -q 'guardia.sh' "$target/.claude/settings.json" 2>/dev/null; then
    echo "  ⚠ .claude/settings.json still runs .claude/hooks/guardia.sh: point the hook to guard.sh when you merge settings.json."
  fi
fi
# Checked whether or not the old folder is still there: a project that deleted it but kept the old paths has a
# Dependabot entry that finds nothing and a CI that can't read its scanner images.
if grep -q '\.github/scanners' "$target/.github/dependabot.yml" "$target/.github/workflows/ci.yml" 2>/dev/null; then
  echo; echo "  ⚠ dependabot.yml or ci.yml still reads .github/scanners: merge them from the template (the images moved to .scanners/)."
fi

echo
if [[ "$mode" == "--apply" ]]; then
  no_symlink .claude/TEMPLATE_VERSION
  ref="$(git -C "$template" describe --exact-match --tags HEAD 2>/dev/null || echo main)"
  echo "$version ($ref)" > "$target/.claude/TEMPLATE_VERSION.sync-tmp.$$"
  mv -f "$target/.claude/TEMPLATE_VERSION.sync-tmp.$$" "$target/.claude/TEMPLATE_VERSION"
  echo "✓ Applied. In the project: review 'git diff', merge the files above by hand, run scripts/test-guard.sh,"
  echo "  add a worklog entry and commit on '$branch'. The files copied are guardrails: you, the owner, commit them"
  echo "  with  GUARDRAILS_OWNER_CHANGE=1 git commit …  (the agent can't)."
else
  echo "Dry run: nothing changed. Use --diff to see the diffs or --apply to replace the template-owned files."
fi
