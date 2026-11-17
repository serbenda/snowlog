#!/usr/bin/env bash
# Checks that the project's written memory is kept, so it doesn't depend on the agent remembering to do it.
#   1. docs/STATE.md exists and has at most 150 lines.
#   2. When both exist, the diagrams in docs/WORKFLOWS.md and their Spanish copies in README.es.md stay in step: same number,
#      same type and the same number of arrows each (a translation can't silently drop a step).
#   3. With BASE and HEAD (a PR): if the changes touch anything other than documentation, docs/WORKLOG.md
#      must gain a real entry: a new "## YYYY-MM-DD — title" heading (outside comments and code fences) with
#      a real Why (three words) and Tested (two words or numbers), whose text is not an old entry's. Only
#      documentation is exempt: Markdown, text, images and diagrams under docs/ (not a requirements.txt or
#      CMakeLists.txt there), images under .github/, the READMEs, CHANGELOG, SECURITY and LICENSE. AGENTS.md
#      and CLAUDE.md in any folder, and Markdown under .claude/ (commands, subagents, skills, rules, their
#      READMEs too) change how the agent behaves: they count as code.
#      Dependabot's updates are exempt when CI says so (PR_AUTHOR=dependabot[bot], after checking with GitHub)
#      and every commit is Dependabot's, or GitHub's own merge of it.
#      The range is compared from its merge base, so code merged into the base meanwhile doesn't count.
# Fails closed: a git error, a missing STATE or an unreadable range is a failure, never a pass.
# Usage: scripts/check-records.sh                                (only the STATE size)
#        [PR_AUTHOR=login] scripts/check-records.sh BASE HEAD     (also the worklog rule for that range)
set -euo pipefail
cd "$(dirname "$0")/.."

failed=0
max_state=150

max_bytes=40000   # lines are the limit; bytes only stop a few huge lines (accented prose is longer)
if [[ ! -f docs/STATE.md || -L docs/STATE.md ]]; then
  echo "✗ docs/STATE.md is missing (or a link): it is the project's current state, read first every session." >&2
  exit 1
fi
# CRLF is one line break; a bare \r breaks a line too.
lines=$(awk '{ sub(/\r$/, ""); print }' docs/STATE.md | tr '\r' '\n' | wc -l | tr -d ' ')
bytes=$(wc -c < docs/STATE.md | tr -d ' ')
if (( bytes > max_bytes )); then
  echo "✗ docs/STATE.md has $bytes bytes (max $max_bytes): keep it short and link instead of copying." >&2
  failed=1
elif (( lines > max_state )); then
  echo "✗ docs/STATE.md has $lines lines (max $max_state). Replace what is outdated and link instead of copying." >&2
  failed=1
else
  echo "✓ docs/STATE.md: $lines/$max_state lines."
fi

# shape <file>: one line per Mermaid diagram, "<type> <arrows>"
shape() {
  awk '/^```mermaid/ { inb = 1; type = ""; arrows = 0; next }
       inb && /^```/ { print type, arrows; inb = 0; next }
       inb { if (type == "") type = $1; line = $0; arrows += gsub(/-->>|->>|-->|==>|-\.->/, "", line) }' "$1"
}
# Only when both exist: a project may drop the Spanish guide (README.es.md says so).
if [[ -f docs/WORKFLOWS.md && -f README.es.md ]]; then
  if [[ "$(shape docs/WORKFLOWS.md)" == "$(shape README.es.md)" ]]; then
    echo "✓ The diagrams in docs/WORKFLOWS.md and README.es.md match ($(shape docs/WORKFLOWS.md | wc -l | tr -d ' ') each)."
  else
    echo "✗ The diagrams in docs/WORKFLOWS.md and README.es.md differ (type and arrows per diagram, English | Spanish):" >&2
    paste -d '|' <(shape docs/WORKFLOWS.md) <(shape README.es.md) | awk -F'|' '$1 != $2 { printf "    diagram %d: %s | %s\n", NR, $1, $2 }' >&2
    echo "  docs/WORKFLOWS.md is the source: change the same steps in README.es.md." >&2
    failed=1
  fi
fi

if [[ $# -eq 2 ]]; then
  base="$1" head="$2"
  if ! git rev-parse --verify --quiet "$base^{commit}" >/dev/null || ! git rev-parse --verify --quiet "$head^{commit}" >/dev/null; then
    echo "✗ cannot read the range $base..$head (is the history fetched? fetch-depth: 0)." >&2
    exit 1
  fi
  # Compare with the merge base (what the PR adds), not the base branch's tip: code merged into the base after
  # the branch point is not part of this PR.
  mb="$(git merge-base "$base" "$head")" || { echo "✗ $base and $head have no common history." >&2; exit 1; }
  # Dependabot is exempt only when GitHub says it opened the PR AND every commit is Dependabot's, committed by
  # GitHub: anyone with write access could push extra commits to a Dependabot branch.
  # A merge GitHub made (committer noreply@github.com, two parents) of Dependabot's PR counts as Dependabot's;
  # there must be at least one Dependabot commit.
  dependabot=0
  if [[ "${PR_AUTHOR:-}" == "dependabot[bot]" ]]; then
    kinds="$(git log --format='%ae %ce %P' "$mb..$head" | awk '
      $1 == "49699333+dependabot[bot]@users.noreply.github.com" && $2 == "noreply@github.com" && NF == 3 { print "bot"; next }
      $2 == "noreply@github.com" && NF == 4 { print "merge"; next }
      { print "other" }' | sort -u)"
    if grep -qx bot <<< "$kinds" && ! grep -qx other <<< "$kinds"; then dependabot=1
    else echo "  Dependabot's, but it has commits by others: the worklog rule applies." >&2; fi
  fi
  if (( dependabot )); then
    echo "✓ Only Dependabot's commits (and GitHub's merges of them): worklog not required."
  else
    # Paths as they are (no "\303\255" quoting), one per line.
    # Submodule bumps count whatever .gitmodules says (ignore = all would hide them).
    changed=$(git -c core.quotePath=false -c diff.ignoreSubmodules=none diff --name-only --no-renames \
      --ignore-submodules=none -z "$mb" "$head" | tr '\0' '\n')
    # Documentation: Markdown, text, images and diagrams under docs/, images under .github/, every README (any
    # folder but hidden ones like .claude/ and .github/, any suffix: README.es.md, README-dev.md), CHANGELOG,
    # SECURITY and LICENSE. Code under docs/ (docs/tools/x.sh) counts as code, and so do the text files tools
    # read there (requirements.txt, constraints.txt, CMakeLists.txt). AGENTS.md and CLAUDE.md in any folder (the
    # agent loads nested ones too) and Markdown under
    # .claude/ are instructions for the agent, so they count as code.
    docs='^docs/.*\.(md|png|jpe?g|gif|svg|webp|pdf|txt|drawio|excalidraw|puml|mmd)$|^\.github/.*\.(png|jpe?g|gif|svg|webp)$|^([^./][^/]*/)*README([._-][^/]*)?\.md$|^(CHANGELOG|SECURITY|CONTRIBUTING|CODE_OF_CONDUCT)\.md$|^LICENSE(\.(md|txt))?$'
    tools='(^|/)((requirements|constraints)[^/]*\.txt|CMakeLists\.txt|CLAUDE\.md|AGENTS\.md)$'
    code=$( { grep -Ev "$docs" <<< "$changed"; grep -Ei "$tools" <<< "$changed"; } | sed '/^$/d' | sort -u || true)
    if [[ -z "$code" ]]; then
      echo "✓ Documentation-only changes: worklog not required."
    else
      # A real new entry: a heading that wasn't there before (anywhere: a back-merge can put newer entries above
      # it), not inside an HTML comment or a code fence, with a possible date and a Why and a Tested of real
      # words.
      problems="$(python3 - <(git show "$mb:docs/WORKLOG.md" 2>/dev/null || true) <(git show "$head:docs/WORKLOG.md" 2>/dev/null || true) <<'PY'
import datetime, re, sys
def entries(path):
    text = re.sub(r"<!--.*?-->", "", open(path).read(), flags=re.S)
    # code fences (CommonMark): closed by the same fence character, at least as long, with nothing after it;
    # an unclosed fence runs to the end of the file
    text = re.sub(r"(?ms)^[ ]{0,3}(\x60{3,}|~{3,})[^\n]*\n.*?(?:^[ ]{0,3}\1[\x60~]*[ \t]*$|\Z)", "", text)
    parts = re.split(r"(?m)^(?=## )", text)
    out = []
    for p in parts:
        m = re.match(r"## (\d{4}-\d{2}-\d{2}) [—–-] (.+)", p)
        if m: out.append((m.group(0).strip(), m.group(1), p))
    return out
def body(block):                                   # the text under the heading, spacing ignored
    return " ".join(block.split("\n", 1)[1].split()) if "\n" in block else ""
old, new = entries(sys.argv[1]), entries(sys.argv[2])
old_heads = {h for h, _, _ in old}
old_bodies = {body(b) for _, _, b in old}
PLACEHOLDER = {"todo", "tbd", "fixme", "placeholder", "pending", "na", "n/a", "none", "xxx", "wip", "later", "same"}
def words(block, field):
    # The text of the field: on its line ("- **Why:** …" or "- **Why**: …") and the lines that continue it, up to the
    # next "- **" bullet. Real words: at least 3 distinct ones of 2+ letters that are not placeholders.
    m = re.search(r"(?ms)^- \*\*" + field + r"(?::\*\*|\*\*:)(.*?)(?=^- \*\*|^## |\Z)", block)
    if not m: return 0
    ws = {w.lower() for w in re.findall(r"[^\W\d_]{2,}|\d+(?:[/.]\d+)*", m.group(1))} - PLACEHOLDER
    return len(ws)
def valid(d):
    try: day = datetime.date.fromisoformat(d)
    except ValueError: return False
    return day <= datetime.date.today() + datetime.timedelta(days=1)
problems, good = [], False
for i, (h, d, block) in enumerate(new):
    if h in old_heads: continue                    # an old entry
    if not valid(d): problems.append(f'"{h}" has an impossible or future date'); continue
    if words(block, "Why") < 3: problems.append(f'"{h}" has no real Why (at least three real words)'); continue
    if words(block, "Tested") < 2: problems.append(f'"{h}" has no real Tested (at least two real words or numbers)'); continue
    if body(block) in old_bodies:                  # an old entry retitled is not a new one
        problems.append(f'"{h}" has the same text as an old entry: it was retitled, not written'); continue
    good = True
if not good and not problems:
    problems.append('no new "## YYYY-MM-DD — title" entry in docs/WORKLOG.md')
print("" if good else "\n".join(problems))
PY
)" || { echo "✗ could not read docs/WORKLOG.md." >&2; exit 1; }
      if [[ -z "$problems" ]]; then
        echo "✓ docs/WORKLOG.md has a new entry for the changes."
      else
        echo "✗ These changes touch more than documentation, but docs/WORKLOG.md has no new entry for them:" >&2
        sed 's/^/    /' <<< "$code" >&2
        sed 's/^/  - /' <<< "$problems" >&2
        echo "  Add an entry on top with the record-changes skill (why, what was rejected, how it was tested, pending)." >&2
        failed=1
      fi
    fi
  fi
elif [[ $# -ne 0 ]]; then
  echo "Usage: $0 [BASE HEAD]" >&2
  exit 2
fi

exit $failed
