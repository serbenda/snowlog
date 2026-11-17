#!/usr/bin/env bash
# Tests for scripts/check-records.sh: builds throwaway git repos and checks each case passes (0) or fails (1).
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
failures=0
# $TMPDIR, not the system temp folder: the Claude Code sandbox only lets commands write there.
tmp="$(mktemp -d "${TMPDIR:-/tmp}/test-check-records.XXXXXX")" || { echo "✗ could not create a temp dir" >&2; exit 1; }
trap 'rm -rf "$tmp"' EXIT

# new_repo <name>: a minimal repo with the script, a STATE and a WORKLOG, and one base commit
new_repo() {
  local d="$tmp/$1"
  mkdir -p "$d/scripts" "$d/docs"
  cp "$root/scripts/check-records.sh" "$d/scripts/"
  printf '# State\n' > "$d/docs/STATE.md"
  printf '# Worklog\n\n## 2026-01-01 — An old entry\n- **Why:** an old reason that was already recorded\n- **Tested:** an old test that was already recorded\n' > "$d/docs/WORKLOG.md"
  git -C "$d" init -q
  git -C "$d" -c user.email=owner@example.com -c user.name=Owner add -A
  git -C "$d" -c user.email=owner@example.com -c user.name=Owner -c core.hooksPath=/dev/null commit -qm base
  echo "$d"
}
commit() {  # commit <repo> <email> <message> [committer email]
  git -C "$1" add -A
  GIT_COMMITTER_EMAIL="${4:-$2}" git -C "$1" -c user.email="$2" -c user.name=x -c core.hooksPath=/dev/null commit -qm "$3"
}
# new_entry: an entry at the top of the worklog (new entries go first), with a real Why and Tested
entry='## 2026-01-02 — A change
- **Why:** the reason this change was needed
- **Tested:** bash scripts/test-something.sh passes'
top() {  # top <repo> <text>: put <text> right after the worklog's title line
  python3 -c 'import sys; p,t=sys.argv[1],sys.argv[2]; s=open(p).read().split("\n",1); open(p,"w").write(s[0]+"\n\n"+t+"\n"+(s[1] if len(s)>1 else ""))' "$1/docs/WORKLOG.md" "$2"
}
check() {  # check <expected> <description> <repo> [range args...]   (PR_AUTHOR passed through)
  local expected="$1" desc="$2" repo="$3" actual; shift 3
  PR_AUTHOR="${PR_AUTHOR:-}" "$BASH" "$repo/scripts/check-records.sh" "$@" >/dev/null 2>&1
  actual=$?
  if [[ "$actual" == "$expected" ]]; then echo "  ok    [$actual] $desc"
  else echo "  FAIL  [$actual, expected $expected] $desc"; failures=$((failures + 1)); fi
}

r=$(new_repo code-with-worklog); b=$(git -C "$r" rev-parse HEAD)
echo 'x' > "$r/app.py"; top "$r" "$entry"; commit "$r" owner@example.com "feat: x"
check 0 "code change with worklog entry" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo worklog-touched-only); b=$(git -C "$r" rev-parse HEAD)
echo 'x' > "$r/app.py"; echo 'typo' >> "$r/docs/WORKLOG.md"; commit "$r" owner@example.com "feat: x"
check 1 "code change with the worklog touched but no entry" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo entry-without-tested); b=$(git -C "$r" rev-parse HEAD)
echo 'x' > "$r/app.py"; top "$r" $'## 2026-01-02 — A change\n- **Why:** the reason this change was needed\n- **Tested:** -'
commit "$r" owner@example.com "feat: x"
check 1 "worklog entry with an empty Tested" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo claude-markdown); b=$(git -C "$r" rev-parse HEAD)
mkdir -p "$r/.claude/commands"; echo 'Do something else' > "$r/.claude/commands/status.md"; commit "$r" owner@example.com "chore: x"
check 1 "a .claude/ command (Markdown) without worklog entry" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo fake-dependabot); b=$(git -C "$r" rev-parse HEAD)
echo 'x' > "$r/app.py"; commit "$r" "49699333+dependabot[bot]@users.noreply.github.com" "feat: x"
check 1 "commits claiming to be Dependabot in a PR opened by someone else" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo dependabot-plus-other); b=$(git -C "$r" rev-parse HEAD)
mkdir -p "$r/.github"; echo 'x' > "$r/.github/a.yml"; commit "$r" "49699333+dependabot[bot]@users.noreply.github.com" "ci: bump" noreply@github.com
echo 'x' > "$r/app.py"; commit "$r" owner@example.com "feat: sneaked in"
PR_AUTHOR="dependabot[bot]" check 1 "a Dependabot PR with someone else's commit added" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo agents-md); b=$(git -C "$r" rev-parse HEAD)
echo 'new rule' > "$r/AGENTS.md"; commit "$r" owner@example.com "docs: rule"
check 1 "AGENTS.md (instructions for the agent) without worklog entry" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo license-dir); b=$(git -C "$r" rev-parse HEAD)
mkdir -p "$r/LICENSES"; echo 'echo hi' > "$r/LICENSES/run.sh"; commit "$r" owner@example.com "chore: x"
check 1 "a script under LICENSES/ is not documentation" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo edited-old-entry); b=$(git -C "$r" rev-parse HEAD)
echo 'x' > "$r/app.py"; sed -i.bak 's/An old entry/An old entry!/' "$r/docs/WORKLOG.md" && rm "$r/docs/WORKLOG.md.bak"
commit "$r" owner@example.com "feat: x"
check 1 "an old entry retitled instead of a new one" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo commented-entry); b=$(git -C "$r" rev-parse HEAD)
echo 'x' > "$r/app.py"; top "$r" "<!--
$entry
-->"; commit "$r" owner@example.com "feat: x"
check 1 "an entry inside an HTML comment" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo entry-at-bottom); b=$(git -C "$r" rev-parse HEAD)
echo 'x' > "$r/app.py"; printf '\n%s\n' "$entry" >> "$r/docs/WORKLOG.md"; commit "$r" owner@example.com "feat: x"
check 0 "a new entry at the bottom counts too (a back-merge can put newer ones above)" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo base-moved-on); fork=$(git -C "$r" rev-parse HEAD)
git -C "$r" switch -q -c side; echo 'more docs' >> "$r/docs/STATE.md"; commit "$r" owner@example.com "docs: x"; head=$(git -C "$r" rev-parse HEAD)
git -C "$r" switch -q -; echo 'x' > "$r/app.py"; top "$r" "$entry"; commit "$r" owner@example.com "feat: on the base"
check 0 "a docs-only PR whose base gained code meanwhile (merge base)" "$r" "$(git -C "$r" rev-parse HEAD)" "$head"

r=$(new_repo bad-range)
check 1 "an unreadable range fails" "$r" 0000000000000000000000000000000000000000 HEAD

r=$(new_repo no-state); rm "$r/docs/STATE.md"
check 1 "missing STATE.md fails" "$r"

r=$(new_repo code-without-worklog); b=$(git -C "$r" rev-parse HEAD)
echo 'x' > "$r/app.py"; commit "$r" owner@example.com "feat: x"
check 1 "code change without worklog entry" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo docs-only); b=$(git -C "$r" rev-parse HEAD)
echo 'more' >> "$r/docs/STATE.md"; echo 'readme' > "$r/README.md"; commit "$r" owner@example.com "docs: x"
check 0 "documentation-only change" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo dependabot); b=$(git -C "$r" rev-parse HEAD)
mkdir -p "$r/.github/workflows"; echo 'on: push' > "$r/.github/workflows/ci.yml"
commit "$r" "49699333+dependabot[bot]@users.noreply.github.com" "ci: bump action" noreply@github.com
PR_AUTHOR="dependabot[bot]" check 0 "pull request opened by Dependabot" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo state-too-long)
for i in $(seq 1 151); do echo "line $i" >> "$r/docs/STATE.md"; done
check 1 "STATE.md over 150 lines" "$r"

r=$(new_repo state-ok)
check 0 "STATE.md within the limit" "$r"

r=$(new_repo diagrams-match)
printf '```mermaid\nflowchart TD\n    A --> B\n    B --> C\n```\n' > "$r/docs/WORKFLOWS.md"
printf '```mermaid\nflowchart TD\n    A["uno"] --> B\n    B --> C["tres"]\n```\n' > "$r/README.es.md"
check 0 "English and Spanish diagrams with the same shape" "$r"

r=$(new_repo diagrams-differ)
printf '```mermaid\nflowchart TD\n    A --> B\n    B --> C\n```\n' > "$r/docs/WORKFLOWS.md"
printf '```mermaid\nflowchart TD\n    A --> C\n```\n' > "$r/README.es.md"
check 1 "a Spanish diagram that lost a step" "$r"

r=$(new_repo placeholder-entry); b=$(git -C "$r" rev-parse HEAD)
echo 'x' > "$r/app.py"; top "$r" $'## 2026-01-02 — A change\n- **Why:** placeholder\n- **Tested:** TODO TODO TODO'
commit "$r" owner@example.com "feat: x"
check 1 "worklog entry with placeholder Why and Tested" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo future-date); b=$(git -C "$r" rev-parse HEAD)
echo 'x' > "$r/app.py"; top "$r" $'## 2099-01-01 — A change\n- **Why:** the reason this change was needed\n- **Tested:** bash scripts/test-something.sh passes'
commit "$r" owner@example.com "feat: x"
check 1 "worklog entry dated in the future" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo impossible-date); b=$(git -C "$r" rev-parse HEAD)
echo 'x' > "$r/app.py"; top "$r" $'## 2026-13-45 — A change\n- **Why:** the reason this change was needed\n- **Tested:** bash scripts/test-something.sh passes'
commit "$r" owner@example.com "feat: x"
check 1 "worklog entry with an impossible date" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo wrapped-fields); b=$(git -C "$r" rev-parse HEAD)
echo 'x' > "$r/app.py"; top "$r" $'## 2026-01-02 — A change\n- **Why:**\n  new users need a greeting when the app starts\n- **Tested**: python3 src/app.py prints the greeting'
commit "$r" owner@example.com "feat: x"
check 0 "Why wrapped onto the next line, colon outside the bold" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo code-under-docs); b=$(git -C "$r" rev-parse HEAD)
mkdir -p "$r/docs/tools"; echo 'echo hi' > "$r/docs/tools/deploy.sh"; commit "$r" owner@example.com "chore: x"
check 1 "a script under docs/ without worklog entry" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo non-ascii-docs); b=$(git -C "$r" rev-parse HEAD)
echo 'guía' > "$r/docs/guía.md"; commit "$r" owner@example.com "docs: x"
check 0 "documentation with a non-ASCII file name" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo sub-readme); b=$(git -C "$r" rev-parse HEAD)
mkdir -p "$r/packages/x"; echo '# x' > "$r/packages/x/README.md"; echo '# x' > "$r/README.pt-BR.md"; commit "$r" owner@example.com "docs: x"
check 0 "READMEs in a subfolder and with a regional locale" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo state-link); mv "$r/docs/STATE.md" "$r/state.md"; ln -s ../state.md "$r/docs/STATE.md"
check 1 "STATE.md as a symbolic link fails" "$r"

r=$(new_repo state-cr); python3 -c 'import sys; open(sys.argv[1],"w").write("\r".join(["l"]*200))' "$r/docs/STATE.md"
check 1 "STATE.md whose lines end in \\r is still counted" "$r"

r=$(new_repo state-bytes); python3 -c 'import sys; open(sys.argv[1],"w").write("x"*50000+"\n")' "$r/docs/STATE.md"
check 1 "STATE.md over the byte limit" "$r"

r=$(new_repo diagram-alone)
printf '```mermaid\nflowchart TD\n    A --> B\n```\n' > "$r/docs/WORKFLOWS.md"
check 0 "WORKFLOWS.md without its Spanish copy (a project may drop README.es.md)" "$r"

r=$(new_repo state-crlf); python3 -c 'import sys; open(sys.argv[1],"w").write("l\r\n"*100)' "$r/docs/STATE.md"
check 0 "STATE.md with CRLF line ends counts each line once" "$r"

r=$(new_repo en-dash); b=$(git -C "$r" rev-parse HEAD)
echo 'x' > "$r/app.py"; top "$r" "${entry/ — / – }"; commit "$r" owner@example.com "feat: x"
check 0 "a worklog heading with an en dash" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo docs-assets); b=$(git -C "$r" rev-parse HEAD)
printf 'png' > "$r/docs/flow.png"; echo '<svg/>' > "$r/docs/flow.svg"; echo '# dev' > "$r/README-dev.md"; commit "$r" owner@example.com "docs: x"
check 0 "images under docs/ and README-dev.md are documentation" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo claude-readme); b=$(git -C "$r" rev-parse HEAD)
mkdir -p "$r/.claude/rules"; echo 'Always do X' > "$r/.claude/rules/README.md"; commit "$r" owner@example.com "docs: x"
check 1 "a README under .claude/ is instructions for the agent, not documentation" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo archive-and-add); b=$(git -C "$r" rev-parse HEAD)
echo 'x' > "$r/app.py"; printf '# Worklog\n\n%s\n' "$entry" > "$r/docs/WORKLOG.md"; commit "$r" owner@example.com "feat: x"
check 0 "old entries archived and a new one added" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo dependabot-merge); b=$(git -C "$r" rev-parse HEAD)
git -C "$r" switch -q -c bump
mkdir -p "$r/.github"; echo 'x' > "$r/.github/a.yml"; commit "$r" "49699333+dependabot[bot]@users.noreply.github.com" "ci: bump" noreply@github.com
git -C "$r" switch -q -
GIT_COMMITTER_EMAIL=noreply@github.com git -C "$r" -c user.email=57532210+serbenda@users.noreply.github.com -c user.name=x -c core.hooksPath=/dev/null merge -q --no-ff -m "Merge pull request #1" bump
PR_AUTHOR="dependabot[bot]" check 0 "GitHub's merge of a Dependabot PR (a push to development)" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"
echo 'y' > "$r/app.py"; git -C "$r" add -A; GIT_COMMITTER_EMAIL=noreply@github.com git -C "$r" -c user.email=x@example.com -c user.name=x -c core.hooksPath=/dev/null commit -qm "feat: y"
PR_AUTHOR="dependabot[bot]" check 1 "a GitHub web commit that is not a merge is not Dependabot's" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo docs-tool-files); b=$(git -C "$r" rev-parse HEAD)
echo 'requests==2.0' > "$r/docs/requirements.txt"; commit "$r" owner@example.com "docs: x"
check 1 "docs/requirements.txt (read by a tool) is not documentation" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo docs-diagrams); b=$(git -C "$r" rev-parse HEAD)
echo '<mxfile/>' > "$r/docs/flow.drawio"; echo 'graph TD' > "$r/docs/flow.mmd"; mkdir -p "$r/.github/assets"; echo '<svg/>' > "$r/.github/assets/banner.svg"
commit "$r" owner@example.com "docs: x"
check 0 "diagrams under docs/ and images under .github/ are documentation" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo fenced-entry); b=$(git -C "$r" rev-parse HEAD)
echo 'x' > "$r/app.py"; top "$r" $'```\n'"$entry"$'\n```'; commit "$r" owner@example.com "feat: x"
check 1 "an entry inside a code fence is not an entry" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo entry-below-newer); b=$(git -C "$r" rev-parse HEAD)
top "$r" $'## 2026-03-01 — A newer entry from main\n- **Why:** a reason that came from the main branch\n- **Tested:** a test that came from the main branch'
commit "$r" owner@example.com "docs: back-merge"; b=$(git -C "$r" rev-parse HEAD)
python3 -c 'import sys; p=sys.argv[1]; s=open(p).read(); i=s.index("## 2026-01-01"); open(p,"w").write(s[:i]+sys.argv[2]+"\n\n"+s[i:])' "$r/docs/WORKLOG.md" "$entry"
echo 'x' > "$r/app.py"; commit "$r" owner@example.com "feat: x"
check 0 "a new entry below a newer one (after a back-merge), dated earlier, counts" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo short-tested); b=$(git -C "$r" rev-parse HEAD)
echo 'x' > "$r/app.py"; top "$r" $'## 2026-01-02 — A change\n- **Why:** the reason this change was needed\n- **Tested:** pytest passed'
commit "$r" owner@example.com "feat: x"
check 0 "a short Tested (two words) is enough" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo nested-claude-md); b=$(git -C "$r" rev-parse HEAD)
echo 'Always do X' > "$r/docs/CLAUDE.md"; commit "$r" owner@example.com "docs: x"
check 1 "docs/CLAUDE.md (loaded by the agent) is not documentation" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

r=$(new_repo unclosed-fence); b=$(git -C "$r" rev-parse HEAD)
echo 'x' > "$r/app.py"; top "$r" $'```text\n'"$entry"; commit "$r" owner@example.com "feat: x"
check 1 "an entry after an unclosed code fence is not an entry" "$r" "$b" "$(git -C "$r" rev-parse HEAD)"

echo
if (( failures == 0 )); then echo "✓ All check-records tests pass."; exit 0
else echo "✗ $failures check-records tests fail."; exit 1; fi
