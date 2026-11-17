#!/usr/bin/env bash
# Claude Code PreToolUse hook: blocks dangerous actions or ones that break the repo's rules.
# Receives the tool's JSON on stdin. Exiting with 2 blocks the action and shows stderr to the agent.
# Fails closed: if it cannot read the input, it blocks.
# It is one more layer, not the only one: main's real protection is the GitHub ruleset and CI.
set -uo pipefail

input="$(cat)"

extract() {  # extract <field> -> prints tool_input.<field>
  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$input" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("tool_input") or {}).get(sys.argv[1]) or "")' "$1"
  elif command -v jq >/dev/null 2>&1; then
    printf '%s' "$input" | jq -r --arg c "$1" '.tool_input[$c] // ""'
  else
    echo "BLOCKED: the security hook needs python3 or jq installed." >&2
    exit 2
  fi
}

block() { echo "BLOCKED by .claude/hooks/guard.sh: $1" >&2; exit 2; }
has() { printf '%s' "$2" | grep -Eiq -- "$1"; }   # has <regex> <text>

cmd_raw="$(extract command)" || block "could not read the hook input."
# Size limit, checked before any parsing: Claude Code lets the action through if the hook times out, so a
# command too long to check within the hook's timeout is refused instead. Real commands are far below it.
(( ${#cmd_raw} > 20000 )) && block "command too long to check (${#cmd_raw} characters): split it into smaller commands."
seps="$(printf '%s' "$cmd_raw" | tr -cd ';&|' | wc -c | tr -d ' ')"
lines="$(printf '%s' "$cmd_raw" | tr -cd '\n' | wc -c | tr -d ' ')"; seps=$(( seps + lines / 5 ))   # a long heredoc is not 160 commands
(( seps > 150 )) && block "command with too many parts to check ($seps separators): split it into smaller commands."
path="$(extract file_path)$(extract path)" || true
# Normalised (//, /./ and x/.. removed), so .claude//hooks or .claude/x/../hooks can't dodge the path rules.
[[ -n "$path" ]] && path="$(python3 -c 'import os,sys; print(os.path.normpath(sys.argv[1]))' "$path" 2>/dev/null || printf '%s' "$path")"
content="$(extract content)$(extract new_string)" || true
search_pattern="$(extract pattern)" || true

# The guardrail paths as git pathspecs from the top of the repository (:/), whatever the current directory.
prot_paths=(.claude/settings.json .claude/settings.local.json .claude/hooks .claude/agents .claude/commands
  .claude/skills .githooks .github .devcontainer .devcontainer.json scripts/setup-repo.sh
  scripts/sync-from-template.sh scripts/check-records.sh scripts/test-guard.sh scripts/test-check-records.sh
  scripts/test-githooks.sh scripts/test-scripts.sh .claude/rules .claude/output-styles .claude/CLAUDE.md .mcp.json
  AGENTS.md CLAUDE.md '*/AGENTS.md' '*/CLAUDE.md' '*/CLAUDE.local.md' .gitleaks.toml .gitleaksignore .semgrepignore .semgrep .scanners osv-scanner.toml .gitattributes)
# The root CLAUDE.local.md is left out: it is the owner's own uncommitted file, so it would trip this for good
# (the deny rules and the sandbox keep the agent from writing it). Nested ones count.
prot_top=(); for pp in "${prot_paths[@]}"; do prot_top+=(":/$pp"); done

# --- Tripwire: guardrails changed outside a commit ---
# The agent can't change the guardrail files (deny rules, this hook, the sandbox), so if they differ from the
# last commit, something got around that, or the owner is mid-change. Until the owner commits or restores
# them, everything except reading is refused. (.claude/settings.json runs this hook from HEAD, so a changed
# copy of the hook on disk can't switch this off.)
# Checked in the project's own repository ($CLAUDE_PROJECT_DIR), whatever directory the session is in now.
proj="${CLAUDE_PROJECT_DIR:-.}"
if ! has '"tool_name" *: *"(Read|Grep|Glob)"' "$input" && git -C "$proj" rev-parse -q --verify HEAD >/dev/null 2>&1; then
  # Untracked ones too, ignored included (settings.local.json…), except the instruction files that packages ship
  # inside dependency folders (node_modules/x/AGENTS.md after npm install): third-party content, not this repo's
  # rules, and they would come back on every install. The list is fixed here, so it can't be widened by the agent.
  tripped="$(git -C "$proj" -c core.quotepath=false diff --name-only HEAD -- "${prot_top[@]}" 2>&1
    git -C "$proj" -c core.quotepath=false ls-files --others -- "${prot_top[@]}" 2>&1 |
      grep -Eiv '(^|/)(node_modules|\.venv|venv|site-packages|__pypackages__|\.tox|\.nox|vendor|Pods|\.pub-cache|\.dart_tool|\.gradle|target)/(.*/)?(AGENTS|CLAUDE|CLAUDE\.local)\.md$' || true)"
  [[ -n "$tripped" ]] &&
    block "guardrail files differ from the last commit: $(printf '%s' "$tripped" | tr '\n' ' ')— the owner must review them and commit (GUARDRAILS_OWNER_CHANGE=1) or restore them before the agent goes on."
  # .git/config is not in any commit, so it is checked by content: settings that switch the hooks off, send
  # pushes elsewhere or make git run a program. setup-repo.sh sets none of them except core.hooksPath=.githooks.
  hp="$(git -C "$proj" config --local --get core.hooksPath 2>/dev/null)" || hp=""
  [[ "$hp" != .githooks && ( -n "$hp" || -d "$proj/.githooks" ) ]] &&
    block "this repository's .git/config sets core.hooksPath to '$hp', not .githooks: the owner must restore it (git config core.hooksPath .githooks)."
  risky="$(git -C "$proj" config --local --name-only --list 2>/dev/null | tr '[:upper:]' '[:lower:]' | grep -E \
    '^(core\.(fsmonitor|sshcommand|pager|editor|askpass|gitproxy)|sequence\.editor|gpg\.(.*\.)?program|alias\..*|include\..*|includeif\..*|protocol\..*|url\..*|credential\..*|pager\..*|remote\..*\.(push|pushurl|receivepack|uploadpack|vcs|mirror)|push\..*|remote\.pushdefault|branch\..*\.pushremote|(diff|merge|filter)\..*\.(command|textconv|driver|clean|smudge|process)|diff\.external|interactive\.difffilter|(help|web)\.browser|(browser|man)\..*\.(cmd|path)|core\.(alternaterefscommand|worktree)|gpg\.ssh\.defaultkeycommand|submodule\..*\.update|extensions\.worktreeconfig)$' |
    sort -u | tr '\n' ' ')"
  [[ -n "$risky" ]] &&
    block "this repository's .git/config has settings that change where pushes go or make git run programs: ${risky}— the owner must review and remove them (git config --local --unset …) before the agent goes on."
  # branch.<name>.remote is normal, but a plain git push goes there: only origin (or . for a local branch).
  while read -r bk bv; do
    [[ "$bv" == origin || "$bv" == . ]] ||
      block "this repository's .git/config sends $bk to '$bv', not origin: a plain git push would go there. The owner must fix it (git config $bk origin)."
  done < <(git -C "$proj" config --local --get-regexp '^branch\..*\.remote$' 2>/dev/null)
  # branch.<name>.merge is where a plain push of that branch can go: only refs/heads/<name>.
  while read -r bk bv; do
    bn="${bk#branch.}"; bn="${bn%.merge}"
    [[ "$bv" == "refs/heads/$bn" ]] ||
      block "this repository's .git/config makes $bn track '$bv': a plain git push could go there. The owner must fix it (git branch --set-upstream-to=origin/$bn $bn)."
  done < <(git -C "$proj" config --local --get-regexp '^branch\..*\.merge$' 2>/dev/null)
fi

# Normalised command: no quotes or backslashes, so 'main' or "main" cannot dodge the rules
cmd="$(printf '%s' "$cmd_raw" | tr -d "\"'\\\\")"
# The command split into simple commands the way the shell splits it, for the per-command rules below.
# A small scanner follows the shell's quoting (unquoted, '…', "…", $'…', $( ), `…`), so a ; or && inside
# quotes is text and one outside quotes is a separator, wherever it appears. It also:
#   - splits on ; && || | & newlines and ( ), and drops leading { } ! if then do… and redirections, so
#     "(git push …)" or "if x; then git push …" are seen as git commands;
#   - re-scans what eval and sh/bash -c run, so "bash -c 'git push …'" is a git command too;
#   - replaces a quoted message operand (-m "…", --message, --body, --title, -b, -t) by MSG only when the
#     shell would treat it as plain text: no $, no `…`, no $( ). A commit message that *mentions*
#     "git push origin main" is text; a message containing $(git push …) is code and stays visible;
#   - fails closed: an unterminated quote or a parse error blocks the command.
IFS= read -r -d '' scanner <<'PY' || true
import os, re, sys
s = sys.argv[1]
LEAD = {"{", "}", "!", "if", "then", "else", "elif", "do", "fi", "done", "while", "until", "time", "coproc", "esac"}
SHELLS = {"sh", "bash", "zsh", "dash", "ksh", "mksh", "ash", "yash", "csh", "tcsh", "fish", "pwsh", "powershell", "busybox"}
INTERP = re.compile(r"(python[0-9.]*|node|perl|ruby|php|deno|bun|lua|Rscript|osascript)")
# Commands whose arguments name things rather than run them (brew install fish, which bash).
NOT_RUN = {"echo", "printf", "grep", "egrep", "fgrep", "rg", "ag", "ack", "man", "which", "type", "whereis",
           "apropos", "info", "tldr", "hash", "brew", "apt", "apt-get", "dnf", "yum", "apk", "port", "pip", "pip3",
           "npm", "pnpm", "yarn", "conda", "git", "gh",
           "ls", "cp", "mv", "rm", "cat", "head", "tail", "file", "stat", "wc", "less", "more", "chmod", "chown", "ln", "mkdir", "rmdir", "touch", "du", "df", "diff", "cmp", "realpath", "readlink", "basename", "dirname", "test", "[", "sort", "uniq", "cut", "tr", "tar", "zip", "unzip", "gzip", "gunzip", "shasum", "md5", "md5sum", "sha256sum", "strings", "od", "hexdump", "xxd", "tree"}
WRAPPERS = {"env", "nice", "timeout", "command", "builtin", "exec", "nohup", "sudo", "doas", "time", "stdbuf", "ionice", "chronic", "xargs", "caffeinate", "arch",
            "setsid", "watch", "flock", "unbuffer", "script", "taskset", "chrt", "nsenter", "firejail", "bwrap", "proot",
            "torsocks", "torify", "fakeroot", "eatmydata", "rlwrap", "cpulimit", "systemd-run", "xcrun", "uv", "uvx",
            "npx", "pnpx", "bunx", "pipx", "noglob", "nocorrect", "repeat", "strace", "ltrace", "dtruss", "valgrind", "entr"}
WPOS = {"flock": 1, "script": 1, "taskset": 1, "chrt": 1, "repeat": 1, "uv": 1, "pipx": 1}   # flock FILE cmd, uv run cmd
# Wrapper options whose value is the next word (stdbuf -o L python3: L is not the command).
WOPTS = {"env": {"-u", "--unset", "-C", "--chdir", "-S", "--split-string", "-P", "-a", "--argv0"}, "nice": {"-n", "--adjustment"},
         "timeout": {"-s", "--signal", "-k", "--kill-after"}, "stdbuf": {"-i", "-o", "-e", "--input", "--output", "--error"},
         "ionice": {"-c", "-n", "-p", "-P", "-u", "--class", "--classdata", "--pid", "--pgid", "--uid"},
         "sudo": {"-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U", "-T", "-R", "-c", "--user", "--group", "--chdir", "--host", "--prompt", "--chroot", "--role", "--type", "--other-user", "--command-timeout", "--login-class"},
         "doas": {"-u", "-C"}, "time": {"-f", "-o", "--format", "--output"}, "exec": {"-a"}, "caffeinate": {"-t", "-w"},
         "arch": {"-arch", "-d", "-e"}, "watch": {"-n", "--interval", "-d"}, "cpulimit": {"-l", "--limit", "-p"},
         "firejail": {"--profile"}, "bwrap": {"--chdir", "--unsetenv", "--uid", "--gid", "--hostname", "--tmpfs", "--proc", "--dev", "--dir", "--remount-ro"},
         "systemd-run": {"-p", "--property", "-u", "--unit", "-E", "--setenv"}, "strace": {"-o", "-e", "-p", "-s"},
         "xcrun": {"--sdk", "--toolchain"}, "nsenter": {"-t", "--target"}, "flock": {"-w", "--timeout", "-E", "--conflict-exit-code"},
         "uv": {"--with", "--python", "-p", "--env-file", "--project", "--directory", "--package", "--extra", "--group", "--index", "--from"}, "xargs": {"-I", "-J", "-L", "-n", "-P", "-s", "-d", "-E", "-a", "-R", "-S", "--max-args", "--max-procs", "--delimiter", "--arg-file", "--max-lines", "--max-chars", "--eof"}}
# Interpreter options whose value is the next word (python3 -W ignore, --check-hash-based-pycs always).
IVAL = {"python": {"-W", "-X", "--check-hash-based-pycs"}, "node": {"-r", "--require", "--import", "--loader", "-C", "--conditions", "--input-type", "--title", "--env-file"},
        "ruby": {"-I", "-r", "-E", "-C", "-F", "--encoding"}, "perl": {"-I", "-M", "-m"}, "php": {"-d", "-c", "-z"}, "lua": {"-l"}}
SECRET_HOME = ["~/.ssh/config", "~/.ssh/id_rsa", "~/.ssh/id_ed25519", "~/.aws/credentials", "~/.aws/config",
               "~/.netrc", "~/.npmrc", "~/.config/gh/hosts.yml", "~/.config/gcloud/credentials.db", "~/.kube/config",
               "~/.docker/config.json", "~/.gnupg/pubring.kbx", "~/.git-credentials", "~/.pypirc",
               "~/.pgpass", "~/.cargo/credentials.toml", "~/.vault-token", "~/.azure/msal_token_cache.json", "~/.s3cfg",
               "~/.boto", "~/.gem/credentials", "~/.zsh_history", "~/.bash_history", "~/.config/git/credentials",
               "~/.terraform.d/credentials.tfrc.json", "~/.config/rclone/rclone.conf", "~/.composer/auth.json",
               "~/.yarnrc.yml", "~/.oci/config", "~/.vercel/auth.json", "~/.m2/settings.xml"]
SECRET_REL = [".env", ".env.local", ".env.production", ".env.development", ".env.test", ".npmrc"]
def braces(t, n=0):
    # The words a {a,b} brace expansion produces (enough of them to test against the secret paths).
    m = re.search(r"\{([^{}]*)\}", t)
    if not m or n > 6: return [t]
    body = m.group(1); seq = re.fullmatch(r"(-?\w+)\.\.(-?\w+)(\.\.-?\d+)?", body)
    if seq:   # {a..c}, {1..3}
        a, b = seq.group(1), seq.group(2)
        if a.lstrip("-").isdigit() and b.lstrip("-").isdigit():
            lo, hi = sorted((int(a), int(b))); alts = [str(x) for x in range(lo, min(hi, lo + 64) + 1)]
        elif len(a) == 1 and len(b) == 1:
            lo, hi = sorted((ord(a), ord(b))); alts = [chr(x) for x in range(lo, hi + 1)]
        else: alts = [body]
    elif "," in body: alts = body.split(",")
    else: return [t]
    out = []
    for alt in alts: out.extend(braces(t[:m.start()] + alt + t[m.end():], n + 1))
    return out[:256]
def gmatch(g, c):
    import fnmatch
    gp, cp = g.split("/"), c.split("/")
    if len(gp) != len(cp): return False
    return all(not (y.startswith(".") and not x.startswith(".")) and fnmatch.fnmatchcase(y, x) for x, y in zip(gp, cp))
def secret_glob(t):
    import fnmatch
    t = re.split(r"[=<>]", t)[-1].replace("'", "").replace('"', "")
    t = re.sub(r"^(\$HOME|\$\{HOME\}|/Users/[^/]+|/home/[^/]+|/root|/var/root|~[A-Za-z0-9_.-]*)(?=/)", "~", t)
    for e in braces(t):
        cands = SECRET_HOME if e.startswith("~") else SECRET_REL
        if any(gmatch(e, c) for c in cands): return True
        if e.startswith("/") and any(gmatch(e, c.replace("~", h)) for c in SECRET_HOME for h in ("/Users/u", "/home/u", "/root", "/var/root")):
            return True
        lit = re.split(r"[*?\[]", e, 1)[0]   # .env.? or ~/.s*: its fixed start already leads to a secret
        if len(lit) >= 2 and lit != e and any(c.startswith(lit) for c in cands): return True
        if "/" in e and not e.startswith(("~", "/")) and any(gmatch(e, e.rsplit("/", 1)[0] + "/" + c) for c in SECRET_REL): return True
    return False
def normp(t):
    # .claude/./hooks, scripts//x.sh and .claude/x/../settings.json name the same files as the plain path.
    if "/" not in t or ("://" in t and "/.." not in t) or "=@" in t: return t
    prev = None
    t = re.sub(r"^(\./)+(?=[^/])", "", t)   # ./../x is ../x
    while prev != t:
        prev = t
        t = re.sub(r"/\.(?=/|$)", "", t)
        t = re.sub(r"(?<=[^/])//+", "/", t)
        t = re.sub(r"(?:(?<=^)|(?<=[/=<>]))(?!\.\.?(?:/|$))[^/=<>]+/\.\.(?:/|$)", "", t)
    return t
class Fail(Exception): pass
def ansi_c(t):
    out, k = [], 0
    simple = {"a": "\a", "b": "\b", "e": "\x1b", "E": "\x1b", "f": "\f", "n": "\n", "r": "\r", "t": "\t",
              "v": "\v", "\\": "\\", "'": "'", '"': '"', "?": "?"}
    while k < len(t):
        c = t[k]
        if c != "\\" or k + 1 >= len(t): out.append(c); k += 1; continue
        e = t[k + 1]
        if e in simple: out.append(simple[e]); k += 2; continue
        m = (re.match(r"[0-7]{1,3}", t[k + 1:]) or re.match(r"x[0-9A-Fa-f]{1,2}", t[k + 1:]) or
             re.match(r"u[0-9A-Fa-f]{1,4}", t[k + 1:]) or re.match(r"U[0-9A-Fa-f]{1,8}", t[k + 1:]))
        if m:
            g = m.group(0)
            val = int(g, 8) if g[0] in "01234567" else int(g[1:], 16)
            if val > 0x10FFFF or val == 0: raise Fail   # a NUL would split the scanner's output
            out.append(chr(val)); k += 1 + len(g); continue
        if e == "c" and k + 2 < len(t):
            if ord(t[k + 2]) & 0x1f == 0: raise Fail
            out.append(chr(ord(t[k + 2]) & 0x1f)); k += 3; continue
        out.append("\\" + e); k += 2
    return "".join(out)
def strip(t): return re.sub(r"[\"'\\]", "", t)
def bq_end(s, i):
    while i < len(s):
        if s[i] == "\\": i += 2; continue
        if s[i] == "`": return i + 1
        i += 1
    raise Fail
def dq_end(s, i):
    while i < len(s):
        c = s[i]
        if c == "\\": i += 2; continue
        if c == '"': return i + 1
        if s.startswith("$(", i): i = sub_end(s, i + 2); continue
        if c == "`": i = bq_end(s, i + 1); continue
        i += 1
    raise Fail
def sub_end(s, i):  # i is just after "$(" or "<(": index after the matching ")"
    depth = 1
    while i < len(s):
        c = s[i]
        if c == "\\": i += 2; continue
        if c == "'":
            j = s.find("'", i + 1)
            if j < 0: raise Fail
            i = j + 1; continue
        if c == '"': i = dq_end(s, i + 1); continue
        if c == "`": i = bq_end(s, i + 1); continue
        if c == "(": depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0: return i + 1
        i += 1
    raise Fail
# "$(cat <<'EOF' … EOF)": a quoted heredoc is literal text (the usual way to write a long commit message).
HEREDOC = re.compile(r"\$\(cat +<<'([A-Za-z_][A-Za-z0-9_]*)'\n(.*?)\n\1\n[ \t\n]*\)", re.S)
def subst_parts(inner, depth):
    # What a $( ), `…` or <( ) runs is a command too: scanned and checked like the rest.
    return scan(inner, depth + 1)
def eff1(ws, k=0):
    # Index of the command a wrapper runs: env/nice/timeout/stdbuf/xargs… with their options and values skipped.
    w = ws[k].rsplit("/", 1)[-1] if k < len(ws) else ""
    if w not in WRAPPERS: return k
    if w == "command" and k + 1 < len(ws) and ws[k + 1] in ("-v", "-V"): return len(ws)   # command -v x only looks x up
    k += 1; skipv = False; npos = WPOS.get(w, 0)
    while k < len(ws):
        t = ws[k]
        if skipv: skipv = False; k += 1; continue
        if npos and not t.startswith("-"): npos -= 1; k += 1; continue
        if w == "bwrap" and t in ("--bind", "--ro-bind", "--dev-bind", "--bind-try", "--ro-bind-try", "--symlink", "--setenv", "--file", "--bind-data"):
            k += 3; continue   # two values each
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", t) or (w == "timeout" and re.fullmatch(r"[0-9.]+[smhd]?", t)): k += 1; continue
        if t.startswith("-") and t != "-":
            if t in WOPTS.get(w, ()): skipv = True
            k += 1; continue
        return k
    return k
def eff(ws):
    k = 0
    while k < len(ws) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", ws[k]): k += 1
    while k < len(ws) and ws[k].rsplit("/", 1)[-1] in WRAPPERS: k = eff1(ws, k)
    return k
def reads_stdin(rest):
    # A shell with no -c and no script file reads its commands from stdin (a pipe, <<EOF, <<<…), which the
    # guard can't see. bash file.sh or bash < file.sh run a file: out of the guard's scope by design.
    j = 0
    while j < len(rest):
        t, q = rest[j][0], rest[j][2]
        if not q and re.match(r"[0-9]*<<", t): return True
        if t.startswith(("<(", "/dev/fd/")): return True   # bash <(printf …): the script is inline text
        if not q and re.match(r"[0-9]*<(?![&<])", t): return False
        if not q and re.match(r"[0-9]*(>|&>)|[0-9]*<&", t):
            j += 2 if re.fullmatch(r"[0-9]*(>>?|&>>?|>\||<&|>&)", t) else 1; continue
        if not q and t in ("--version", "--help", "-version", "-help"): return False
        if not q and t == "--": j += 1; continue
        if not q and re.match(r"[-+].", t):
            if t in ("-o", "+o", "-O", "+O", "--rcfile", "--init-file"): j += 2; continue
            if re.fullmatch(r"-[a-z]*s[a-z]*", t): return True   # bash -s: commands from stdin
            j += 1; continue
        return t in ("-", "/dev/stdin", "/dev/fd/0")
    return True
def scan(s, depth=0):
    if depth > 6: raise Fail
    parts, words, w = [], [], None
    dbr = [False]   # inside [[ … ]]
    casepat = [False]   # right after ;; in a case: the next word before ) is a pattern
    casedepth = [0]     # open case … esac statements
    heredocs = []   # pending <<WORD bodies: (delimiter, quoted, strip_tabs), read after the next newline
    def add(t, lit=True, q=False, glob=False):
        nonlocal w
        if w is None: w = ["", True, False, False]
        w[0] += t; w[1] = w[1] and lit; w[2] = w[2] or q; w[3] = w[3] or glob
    def end_word():
        nonlocal w
        if w is not None:
            words.append(w)
            if dbr[0] and w[0] == "]]" and not w[2]: dbr[0] = False
            elif (not dbr[0] and not casepat[0] and w[0] == "[[" and not w[2]
                  and all(x[0] in LEAD | {"-p", "--"} and not x[2] for x in words[:-1])): dbr[0] = True
            w = None
    def end_part():
        end_word(); dbr[0] = False
        ws = list(words); words.clear()
        # "case x in" ending a line: the next word before ) is the first pattern; any other part end clears it.
        if ws:
            lead = [x for x in ws if not (x[0] in LEAD and not x[2])]   # if case …, { case …, ! case …
            first = lead[0][0] if lead else ""
            if any(x[0] == "esac" and not x[2] for x in ws): casedepth[0] = max(0, casedepth[0] - 1)
            if first == "case" and not lead[0][2]: casedepth[0] += 1
            casepat[0] = first == "case" and ws[-1][0] == "in" and not ws[-1][2]
        while ws:
            t, lit, q = ws[0][:3]
            if not q and t in LEAD:
                ws.pop(0)
                if t == "coproc" and len(ws) > 1 and ws[1][0] == "{" and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", ws[0][0]): ws.pop(0)   # coproc NAME { …; }
                if t == "time":
                    while ws and not ws[0][2] and ws[0][0] in ("-p", "--"): ws.pop(0)
                continue
            if not q and t == "function":   # function f { …; }: the body is checked like any command
                ws.pop(0)
                if ws: ws.pop(0)
                continue
            if not q and re.match(r"^[0-9]*(<|>|&>)", t):
                ws.pop(0)
                if re.fullmatch(r"[0-9]*(<<?|>>?|&>>?|>\||<&|>&)", t) and ws: ws.pop(0)
                continue
            break
        if not ws: return
        if ws[0][0] == "eval" and len(ws) > 1:
            parts.extend(scan(" ".join(x[0] for x in ws[1:]), depth + 1)); return
        if ws[0][0] == "trap":   # trap 'cmd' SIGNAL: cmd runs later, so it is checked now
            for x in ws[1:]:
                if not x[0].startswith("-"): parts.extend(scan(x[0], depth + 1)); break
        # sh -c '…' runs a command: also /bin/bash -c, env bash -c, nice sh -c… (any shell word, then -c)
        # Only when the shell is what runs: the command word, or after wrappers, options, VAR=… or numbers
        # (env bash -c, timeout 5 sh -c). "echo bash -c …" is text.
        c0 = next((x[0] for x in ws if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", x[0])), "")
        for k0, x in enumerate(ws):
            if c0.rsplit("/", 1)[-1] in NOT_RUN or (c0 == "command" and len(ws) > 1 and ws[1][0] in ("-v", "-V")): break
            b = x[0].rsplit("/", 1)[-1]
            if b in SHELLS and (not x[2] or x[0] == c0):
                k1 = k0 + 1
                if b == "busybox" and k1 < len(ws) and ws[k1][0] in SHELLS | {"hush"}: k1 += 1   # busybox sh
                if b in ("pwsh", "powershell"):
                    # PowerShell accepts any prefix of its parameters (-c, -co, -Command…); -EncodedCommand is
                    # opaque, so refused; powershell's first operand is a command, pwsh's a script file.
                    k, ran = k1, False
                    while k < len(ws):
                        tl = ws[k][0].lower().rstrip(":")
                        nm = tl.lstrip("-"); pre = lambda w, m=1: tl.startswith("-") and len(nm) >= m and w.startswith(nm)
                        if pre("encodedcommand") or pre("encodedarguments", 8) or nm in ("ec", "ea"):
                            parts.append("GUARD_SHELL_STDIN"); ran = True; break
                        if pre("command") or pre("commandwithargs") or nm == "cwa":
                            rest = " ".join(x[0] for x in ws[k + 1:])
                            if rest in ("", "-"): parts.append("GUARD_SHELL_STDIN")
                            else: parts.extend(scan(re.sub(r"\[[A-Za-z_][A-Za-z0-9_.]*\]::", "PSTYPE::", rest), depth + 1)); parts.append("GUARD_PWSH " + rest.replace("\n", " "))
                            ran = True; break
                        if pre("file"):
                            if k + 1 >= len(ws) or ws[k + 1][0] == "-": parts.append("GUARD_SHELL_STDIN")
                            ran = True; break
                        if tl.startswith("-"):
                            k += 2 if re.fullmatch(r"--?(ex|ep|executionpolicy|wd|workingdirectory|configurationname|config|of|outputformat|if|inputformat|settingsfile|w|windowstyle|custompipename)", tl) else 1
                            continue
                        if b == "powershell":
                            rest = " ".join(x[0] for x in ws[k:])
                            parts.extend(scan(re.sub(r"\[[A-Za-z_][A-Za-z0-9_.]*\]::", "PSTYPE::", rest), depth + 1)); parts.append("GUARD_PWSH " + rest.replace("\n", " "))
                        ran = True; break
                    if not ran: parts.append("GUARD_SHELL_STDIN")
                    break
                ran = False
                for k in range(k1, len(ws) - 1):
                    if re.fullmatch(r"-[a-z]*c[a-z]*|(?i:-c(ommand)?:?)", ws[k][0]):
                        if ws[k + 1][0] == "-": parts.append("GUARD_SHELL_STDIN")   # pwsh -Command -
                        parts.extend(scan(ws[k + 1][0], depth + 1)); ran = True; break
                if not ran and reads_stdin(ws[k1:]): parts.append("GUARD_SHELL_STDIN")
                break
        ie = eff([x[0] for x in ws])
        ib = ws[ie][0].rsplit("/", 1)[-1] if ie < len(ws) else ""
        if not INTERP.fullmatch(ib) and ws[0][0].rsplit("/", 1)[-1] in WRAPPERS and ib not in NOT_RUN:   # an option table can't know every wrapper
            ie = next((k for k in range(1, len(ws)) if INTERP.fullmatch(ws[k][0].rsplit("/", 1)[-1]) and not ws[k][2]), ie)
            ib = ws[ie][0].rsplit("/", 1)[-1] if ie < len(ws) else ""
        if INTERP.fullmatch(ib):
            lang = re.sub(r"[0-9.]+$", "", ib)
            other = []; j = ie; fed = False; skipv = False
            while j < len(ws) - 1:
                j += 1; t, q = ws[j][0], ws[j][2]
                if skipv: skipv = False; continue
                if not q and t.startswith("-") and t != "-":
                    # -W ignore, -X dev, node -r mod take a value; -c/-m/-e/-p/-r (php)/-E… carry the code itself
                    if t in IVAL.get(lang, ()) or (lang not in ("python", "perl") and t.startswith("--") and "=" not in t and
                            j + 1 < len(ws) and not re.search(r"[./]", ws[j + 1][0]) and lang not in ("deno", "bun")):
                        skipv = True; continue
                    # code on the command line, or a mode that runs files / prints and exits (node --test, -V, --help)
                    if re.fullmatch(r"-[A-Za-z]*[cmeEpr]|--(eval|print|command)(=.*)?|--(test|run|version|help|check)(=.*)?|-[vVh]", t): other.append(t)
                    continue
                if not q and t == "<<<" and j + 1 < len(ws):
                    parts.append(ib + " -c " + ws[j + 1][0].replace("\n", " ; ")); fed = True; j += 1; continue
                if not q and t.startswith("<<"): fed = True; continue
                if not q and re.match(r"[0-9]*(<|>|&>)", t):
                    if re.fullmatch(r"[0-9]*(<|>>?|&>>?|>\||<&|>&)", t): j += 1
                    continue
                if t != "-":
                    # A script operand names a file (x.py, scripts/run, artisan); deno/bun take a subcommand.
                    # Anything else may be an option's value, and the interpreter would then read stdin.
                    if q or re.search(r"[./]", t) or lang in ("deno", "bun") or os.path.isfile(t): other.append(t); break
            if not other and not fed and not any(x[0].startswith("<") for x in ws[1:]):
                parts.append("GUARD_SHELL_STDIN")   # python3 with no script reads its code from a pipe
        if any(x[3] and secret_glob(x[0]) for x in ws):
            parts.append("GUARD_ENV_GLOB")   # cat .e*, cat .{env,x}: the shell would expand it to .env
        if ws[0][0] in ("git", "gh") and any(x[3] for x in ws[1:]):
            parts.append("GUARD_GIT_GLOB")   # bash expands these after the guard has looked: --no-{v..v}erify
        # Which flags take a text message depends on the command: git commit/tag/merge/stash -m, gh … -b/-t.
        # (git checkout -b or git branch -m take a branch name, which the branch rules must see.)
        ci = 0
        while ci < len(ws) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", ws[ci][0]): ci += 1
        mflags = set()
        if ci < len(ws) and ws[ci][0] == "gh": mflags = {"-b", "--body", "-t", "--title"}
        elif ci < len(ws) and ws[ci][0] == "git":
            j = ci + 1
            while j < len(ws) and ws[j][0].startswith("-"): j += 2 if ws[j][0] in ("-C", "-c") else 1
            if j < len(ws) and ws[j][0] in ("commit", "tag", "merge", "stash"): mflags = {"-m", "--message"}
        out = []
        for k, (t, lit, q, _g) in enumerate(ws):
            prev = ws[k - 1][0] if k else None
            if q and lit and prev in mflags: t = "MSG"
            elif q and lit and re.match(r"--(message|body|title)=", t) and t.split("=", 1)[0] in mflags: t = t.split("=", 1)[0] + "=MSG"
            if t != "MSG" and not t.endswith("=MSG"): t = normp(t)
            out.append(re.sub(r"\s", "\x1f", t))   # one word stays one word: "a b" is not two arguments
        parts.append(" ".join(out))
        # find -exec/-execdir/-ok/-okdir runs a command of its own: checked like one.
        if ws and ws[0][0].rsplit("/", 1)[-1] == "find":
            for a, x in enumerate(ws):
                if x[0] in ("-exec", "-execdir", "-ok", "-okdir"):
                    e = next((b for b in range(a + 1, len(ws)) if ws[b][0] in (";", "+")), len(ws))
                    if e > a + 1: parts.append(" ".join(out[a + 1:e]))
        # The command a wrapper runs is also checked on its own: command env, nice -n 5 env, stdbuf -o L printenv.
        wk = 0; ow = [x[0] for x in ws]
        while wk < len(ow) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", ow[wk]): wk += 1
        while wk < len(ow) and ow[wk].rsplit("/", 1)[-1] in WRAPPERS:
            w0 = ow[wk].rsplit("/", 1)[-1]; start = wk
            wk = eff1(ow, wk)
            if w0 == "xargs":
                # xargs -I R R pr merge: the program itself would come from stdin.
                repl = None
                for a in range(start + 1, wk):
                    t = ow[a]
                    if t in ("-I", "-J") and a + 1 < wk: repl = ow[a + 1]
                    elif re.fullmatch(r"-[IJ].+", t): repl = t[2:]
                    elif re.fullmatch(r"(-i|--replace=?)(.*)", t): repl = re.fullmatch(r"(-i|--replace=?)(.*)", t).group(2) or "{}"
                if repl and wk < len(ow):
                    pb = ow[wk].rsplit("/", 1)[-1]
                    evals = pb in SHELLS | {"pwsh", "powershell", "eval", "source", ".", "xargs", "env"} or INTERP.fullmatch(pb)
                    if repl in ow[wk] or (evals and any(repl in x for x in ow[wk + 1:])): parts.append("GUARD_XARGS_CMD")
            if wk < len(out):
                if ow[wk] == "eval" and wk + 1 < len(ow): parts.extend(scan(" ".join(ow[wk + 1:]), depth + 1))
                parts.append(" ".join(out[wk:]))
    def read_heredocs(i):
        # Bodies start after the newline at i. A quoted delimiter (<<'EOF') makes the body plain text; an
        # unquoted one still expands $( ) and `…` inside it, so those are checked.
        k = i + 1
        for delim, quoted, strip_tabs, hc in heredocs:
            body = []
            while k <= n:
                e = s.find("\n", k); e = n if e < 0 else e
                line = s[k:e]; k = e + 1
                if (line.lstrip("\t") if strip_tabs else line) == delim: break
                body.append(line)
            if INTERP.fullmatch(hc):   # python3 - <<'PY' … PY: the code is checked like python3 -c
                parts.append(hc + " -c " + " ; ".join(body))
            if not quoted:
                b = "\n".join(body); j = 0
                while j < len(b):
                    if b[j] == "\\": j += 2; continue
                    if b.startswith("$(", j):
                        e2 = sub_end(b, j + 2); parts.extend(subst_parts(b[j + 2:e2 - 1], depth))
                        parts.append("heredoc $(" + strip(b[j + 2:e2])); j = e2; continue
                    if b[j] == "`":
                        e2 = bq_end(b, j + 1); parts.extend(subst_parts(b[j + 1:e2 - 1], depth))
                        parts.append("heredoc `" + strip(b[j + 1:e2])); j = e2; continue
                    j += 1
        heredocs.clear()
        return k
    i, n = 0, len(s)
    while i < n:
        c = s[i]
        if c == "\\":
            if s[i + 1:i + 2] != "\n": add(s[i + 1:i + 2], q=True)
            i += 2; continue
        if c in " \t":
            end_word()
            i += 1; continue
        if w is not None and w[0] in ("[[", "]]") and not w[2] and c in "|&<>()\n;": end_word()   # [[(… / ]]&& / ]];
        if dbr[0] and c == "\n": i += 1; continue   # [[ a &&⏎ b ]]: newlines are blanks inside a test
        if dbr[0] and c in "|&<>()" and not s.startswith(("$(", "<(", ">("), i):
            if c in "()": end_word(); add(c); end_word(); i += 1; continue   # [[(a)]]: ( and ) are words of their own
            add(("\x1f" + c) if c in "<>" else c); i += 1; continue   # [[ a > b ]] compares, it doesn't redirect
        if c == "#" and w is None:   # a comment, up to the end of the line
            e = s.find("\n", i); i = n if e < 0 else e; continue
        if c == "\n":
            end_part()
            i = read_heredocs(i) if heredocs else i + 1; continue
        if s.startswith(";;", i) or s.startswith(";&", i):
            if casedepth[0] <= 0: raise Fail   # ;; with no case open: can't tell what bash makes of it
            end_part(); casepat[0] = True; i += 3 if s.startswith(";;&", i) else 2; continue
        if c == ";": end_part(); i += 1; continue
        if s.startswith("<<<", i): end_word(); add("<<<"); end_word(); i += 3; continue
        if s.startswith("<<", i):
            j = i + 2; strip_tabs = s[j:j + 1] == "-"; j += strip_tabs
            while j < n and s[j] in " \t": j += 1
            k = j
            while k < n and s[k] not in " \t\n;&|<>()": k += 1
            raw = s[j:k]
            if not raw: raise Fail
            hw = [x[0] for x in words] + ([w[0]] if w else [])
            he = eff(hw); hc = hw[he] if he < len(hw) else ""   # env python3 <<'PY' too
            heredocs.append((strip(raw), any(q in raw for q in "'\"\\"), strip_tabs, hc.rsplit("/", 1)[-1]))
            end_word(); add("<<" + strip(raw)); end_word(); i = k; continue
        if c == "|" and i > 0 and s[i - 1] == ">": add(c); i += 1; continue   # >| is a redirection
        if c == "|": end_part(); i += 2 if s[i:i + 2] in ("||", "|&") else 1; continue
        if c == "&":
            if s[i:i + 2] == "&&": end_part(); i += 2; continue
            if (i > 0 and s[i - 1] in "<>") or s[i + 1:i + 2] == ">": add(c); i += 1; continue
            end_part(); i += 1; continue
        if s.startswith(("$(", "<(", ">("), i):
            j = sub_end(s, i + 2)
            if re.search(r"(^|[\s;&|(])case\s", s[i + 2:j - 1]): raise Fail   # case inside $( ): its ) would close it
            parts.extend(subst_parts(s[i + 2:j - 1], depth))
            add(s[i:i + 2] + strip(s[i + 2:j]), lit=False); i = j; continue
        if (casepat[0] or (words and words[0][0] == "case" and not words[0][2])) and c == "|":
            add(c); i += 1; continue   # a|b) is one pattern
        if c == ")" and (casepat[0] or (words and words[0][0] == "case" and not words[0][2])):
            end_word()
            pat = words if casepat[0] else words[3:] if len(words) >= 3 and words[2][0] == "in" else None
            if pat is None or len(pat) > 1 or (pat and pat[0][0].lstrip("(") in ("", "[[")): raise Fail
            if not casepat[0]: casedepth[0] += 1   # the header "case x in" went with its first pattern
            words.clear(); casepat[0] = False; i += 1; continue   # case x in pat) / ;; pat)
        if c in "()": end_part(); i += 1; continue
        if c == "`":
            j = bq_end(s, i + 1); parts.extend(subst_parts(s[i + 1:j - 1], depth))
            add("`" + strip(s[i + 1:j - 1]) + "`", lit=False); i = j; continue
        if s.startswith("$'", i):
            # ANSI-C quoting: decoded the way bash does, so $'g\x69t' is seen as git.
            j = i + 2
            while j < n and s[j] != "'": j += 2 if s[j] == "\\" else 1
            if j >= n: raise Fail
            add(ansi_c(s[i + 2:j]), q=True); i = j + 1; continue
        if c == "'":
            j = s.find("'", i + 1)
            if j < 0: raise Fail
            add(s[i + 1:j], q=True); i = j + 1; continue
        if c == '"':
            j, buf, lit = i + 1, "", True
            while True:
                if j >= n: raise Fail
                ch = s[j]
                if ch == '"': j += 1; break
                if ch == "\\":
                    nx = s[j + 1:j + 2]
                    if nx in ("$", "`", '"', "\\"): buf += nx
                    elif nx != "\n": buf += "\\" + nx
                    j += 2 if nx else 1; continue
                hm = HEREDOC.match(s, j)
                if hm and ("\n" + hm.group(1) + "\n") not in ("\n" + hm.group(2) + "\n"):
                    buf += hm.group(2); j = hm.end(); continue
                if s.startswith("$(", j):
                    k = sub_end(s, j + 2); parts.extend(subst_parts(s[j + 2:k - 1], depth))
                    buf += "$(" + strip(s[j + 2:k]); lit = False; j = k; continue
                if ch == "`":
                    k = bq_end(s, j + 1); parts.extend(subst_parts(s[j + 1:k - 1], depth))
                    buf += "`" + strip(s[j + 1:k - 1]) + "`"; lit = False; j = k; continue
                if ch == "$": lit = False
                buf += ch; j += 1
            add(buf, lit=lit, q=True); i = j; continue
        add(c, lit=(c != "$"), glob=(c in "*?[") or (c == "{" and re.match(r"\{(?:'[^']*'|\"[^\"]*\"|[^}'\"\s])*(,|\.\.)", re.sub(r"\\.", "", s[i:])) is not None)); i += 1
    end_part()
    return parts
try:
    out = scan(s)
except (Fail, RecursionError):
    out = ["GUARD_SCAN_FAILED"]
sys.stdout.write("".join(p + "\0" for p in out))
PY
parts=()
if [[ -n "$cmd_raw" ]]; then
  command -v python3 >/dev/null 2>&1 || block "the security hook needs python3 to read shell commands."
  while IFS= read -r -d '' p; do parts+=("$p"); done \
    < <(python3 -c "$scanner" "$cmd_raw" 2>/dev/null || printf 'GUARD_SCAN_FAILED\0')
  # Fails closed: a command the scanner can't follow (unbalanced quotes, unusual escapes…) is refused, not
  # guessed at. Rewrite it with plain quoting.
  [[ " ${parts[*]+"${parts[*]}"} " == *" GUARD_SCAN_FAILED "* ]] &&
    block "could not follow the quoting of this command, so it can't be checked: rewrite it with plain quotes."
  [[ " ${parts[*]+"${parts[*]}"} " == *" GUARD_SHELL_STDIN "* ]] &&
    block "a shell or interpreter that reads its commands from a pipe, a heredoc, a here-string or <( ) hides them from the guard: run them directly (or bash -c '…', python3 -c '…')."
  [[ " ${parts[*]+"${parts[*]}"} " == *" GUARD_XARGS_CMD "* ]] &&
    block "xargs -I with the replacement as the program would take the program from its input: name the program."
  # Inline PowerShell: paths and code built at run time ("En"+"v:", iex, & (…), [type]…) can't be checked.
  for p in "${parts[@]+"${parts[@]}"}"; do
    [[ "$p" == "GUARD_PWSH "* ]] || continue
    pw="$(printf '%s' "${p#GUARD_PWSH }" | tr '[:upper:]' '[:lower:]')"
    has '(^|[^a-z0-9_$])env:' "$pw" && block "dump of environment variables from PowerShell (the Env: drive)."
    has "(iex|invoke-expression|invoke-command|icm|start-process|saps|\[type\]|gettype|-as +\[|\[char|\[scriptblock|::create|-join|-f +|-replace|frombase64|['\"] *\+|\+ *['\"]|(^|[^&])&([^&]|\$)|\. *[(\$])" "$pw" &&
      block "inline PowerShell that builds names or code at run time (concatenation, iex, & (…), [type]…) can't be checked: write it literally."
    has "(^|[ ;(|])(gci|ls|dir|get-childitem|gi|get-item|gc|cat|type|get-content|gp|get-itemproperty|sls|select-string|cd|sl|set-location|pushd|push-location|cp|copy-item|rvpa|resolve-path)( +-[a-z]+)* +[(\$]" "$pw" &&
      block "inline PowerShell with a path built at run time can't be checked: write the path literally."
  done
  [[ " ${parts[*]+"${parts[*]}"} " == *" GUARD_GIT_GLOB "* ]] &&
    block "unquoted *, ?, [ or { in a git command: the shell expands them after the guard has checked it. Quote the pattern ('*.py'): git matches pathspecs itself."
fi
cmd_code="$(printf '%s\n' "${parts[@]+"${parts[@]}"}" | sed -E 's/(^|[ ;&|(])git( +(--no-pager|-P|--no-optional-locks))+( |$)/\1git\4/g')"
# The text rules below read cmd: it gets the decoded commands too (one per line), so $'\x2eenv', $'\x6derge'
# or a path spelled in ANSI-C quoting is seen as .env, merge or the path itself.
cmd="$cmd"$'\n'"$(printf '%s' "$cmd_code" | tr -d "\"'\\\\")"

# --- Security configuration: the agent cannot touch its own guardrails ---
# Protected: the agent's own settings, hook, commands, subagents and skills; the git hooks; the CI and
# Dependabot (.github/); the files editors and tools run on their own (.vscode/ settings, tasks and launch,
# workspace files, .envrc, .husky/,
# .pre-commit-config.yaml: they could run code outside this hook or switch the git hooks off); and the
# scripts that enforce or test the rules. Only the owner changes them. (They are not in the tripwire: an
# editor rewrites .vscode/ on its own.)
protected_files_re='(^|/)(\.git/|\.claude/(settings(\.local)?\.json|hooks/|agents/|commands/|skills/|rules/|output-styles/|CLAUDE\.md)|AGENTS\.md|CLAUDE\.md|CLAUDE\.local\.md|\.mcp\.json|\.gitleaks(\.toml|ignore)|\.gitattributes|\.semgrepignore|\.semgrep/|\.scanners/|osv-scanner\.toml|\.githooks/|\.github/|\.devcontainer(/|\.json)|\.vscode/(settings|tasks|launch)\.json|[^/]*\.code-workspace|\.envrc|\.husky/|\.pre-commit-config\.yaml|scripts/(setup-repo|sync-from-template|check-records|test-guard|test-check-records|test-githooks|test-scripts)\.sh)'
if [[ -n "$path" ]] && has "$protected_files_re" "$path"; then
  has '"tool_name" *: *"(Read|Grep|Glob)"' "$input" ||
    block "the security configuration (.claude/, .githooks/, .github/, enforcement scripts) is changed only by the owner."
fi
# Via the shell. Strict by default: a command that mentions a protected path and writes anything is blocked.
# The only relaxation is for simple commands (no cd/pushd, loops, read/set/printf -v, find/xargs, eval/source,
# variables or command substitution): there each subcommand is checked on its own, so read-only commands like
# "git rm app.py && git grep x -- ':!.claude/skills'" or "ls .claude/commands 2>/dev/null" are not taken for
# writes. Harmless redirections (2>/dev/null, >&2, 2>&1) never count as writing.
protected_re='((^|[ /=<>])\.git(/|( |$))|\.claude/(settings|hooks|agents|commands|skills|rules|output-styles|CLAUDE\.md)|AGENTS\.md|CLAUDE\.md|CLAUDE\.local\.md|\.mcp\.json|\.gitleaks(\.toml|ignore)|\.gitattributes|\.semgrepignore|\.semgrep([^A-Za-z0-9_-]|$)|\.scanners([^A-Za-z0-9_-]|$)|osv-scanner\.toml|\.githooks([^A-Za-z0-9_-]|$)|(^|[ /=])\.claude/?( |$)|\.github([^A-Za-z0-9_-]|$)|\.devcontainer([^A-Za-z0-9_-]|$)|\.vscode([^A-Za-z0-9_-]|$)|\.envrc|\.husky([^A-Za-z0-9_-]|$)|\.pre-commit-config\.yaml|(^|[ /=])scripts/?( |$)|scripts/(setup-repo|sync-from-template|check-records|test-guard|test-check-records|test-githooks|test-scripts)\.sh)'
write_re='((^|[^'$'\x1f''])>|sed +-i|(^|[ ;&|(])(tee|cp|mv|rm|chmod|ln|truncate|install|patch|tar|unzip|rsync|touch|mkdir|unlink|shred|rmdir|ditto|sponge|split|uniq|vi|vim|nvim|emacs)([ <>]|$)|find .* -delete|(curl|wget) .*(-o|-O|--output|--output-document)( |=)|sort( .*)? -o|awk .*>|unlink|file_put_contents|File\.(delete|write)|fs\.(unlink|rm|write)|os\.(remove|unlink)|shutil\.|dd .*of=|perl +-[a-z]*i|ruby +-[a-z]*i|awk +-i|python3? +-c|node +-e|writeFile|\.write\(|open\(|git( +[^ ]+)* +(checkout|restore)( +[^ ]+)* +-- )'
indirect_re='((^|[ ;&|])(cd|pushd|for|while|until|read|set|printf +-v|xargs|find|eval|source|exec)( |$)|=|\$\(|`|\$\{?[A-Za-z_])'
prot_paths_text=(.git/ .claude/settings .claude/hooks .claude/agents .claude/commands .claude/skills .claude/rules
  .claude/output-styles .claude/CLAUDE.md AGENTS.md CLAUDE.md CLAUDE.local.md .mcp.json .gitleaks .gitattributes .semgrep .scanners osv-scanner.toml .githooks
  .github .devcontainer scripts/setup-repo.sh scripts/sync-from-template.sh scripts/check-records.sh scripts/test-)
# URLs (https://…/.github, git@…) name another repository, not a path here.
nourl() { printf '%s' "$1" | sed -E 's#[A-Za-z][A-Za-z0-9+.-]*://[^] <>|;&()]*|git@[^] <>|;&()]*##g'; }
strip_redirs() { printf '%s' "$1" | sed -E 's/[0-9]*>&[0-9-]+//g; s/&?[0-9]*>>? *\/dev\/(null|stderr|stdout)//g'; }

# A write whose target is a pattern ({hooks,}, .c?aude, .gith*) that could match a guardrail path: refused,
# since the path can't be read from the text. (The sandbox's denyWrite is the real barrier for these.)
for p in "${parts[@]+"${parts[@]}"}"; do
  has "$write_re" "$(strip_redirs "$p")" || continue
  read -r -a ws <<< "$p"
  [[ " pip pip3 uv poetry pdm npm pnpm yarn " == *" ${ws[0]##*/} "* ]] && continue
  for t in "${ws[@]}"; do
    [[ "$t" == *[*?[{]* ]] || continue
    pre="${t%%[*?[{]*}"; pre="${pre#>}"; pre="${pre#./}"
    msg="a write to a pattern ('$t') that could reach the guardrail files: name the files instead."
    for pp in "${prot_paths_text[@]}"; do
      [[ -n "$pre" ]] && [[ "$pp" == "$pre"* || "$pre" == "$pp"* ]] && block "$msg"
    done
    # A pattern with no literal start (*.md, [A]GENTS.md, */semgrep/Dockerfile) or a brace list: matched against
    # the guardrail files that exist (a pattern only ever expands to existing files), by path and by name.
    g="${t#>}"; g="${g#./}"
    has '[{}]' "$g" && has '(agents|claude|scanners|semgrep|gitleaks|gitattributes|osv-scanner|githooks|github|devcontainer|envrc|husky|pre-commit|code-workspace|vscode|mcp)' "$g" && block "$msg"
    lg="$(printf '%s' "$g" | tr '[:upper:]' '[:lower:]')"
    while IFS= read -r gf; do
      [[ -z "$gf" ]] && continue
      lf="$(printf '%s' "$gf" | tr '[:upper:]' '[:lower:]')"
      # shellcheck disable=SC2053  # the right side is the pattern on purpose
      [[ "$lf" == $lg || "${lf##*/}" == $lg || "$lf" == $lg/* ]] && block "$msg"
    done < <(git -C "$proj" -c core.quotepath=false ls-files -co --exclude-standard -- "${prot_top[@]}" ':/CLAUDE.local.md' 2>/dev/null)
  done
done

if [[ -n "$cmd" ]] && has "$protected_re" "$(nourl "$cmd")" && has "$write_re" "$(strip_redirs "$cmd")"; then
  has "$indirect_re" "$cmd" &&
    block "the security configuration (.claude/, .githooks/, .github/, enforcement scripts) is changed only by the owner."
  for p in "${parts[@]+"${parts[@]}"}"; do
    if has "$protected_re" "$(nourl "$p")" && has "$write_re" "$(strip_redirs "$p")"; then
      block "the security configuration (.claude/, .githooks/, .github/, enforcement scripts) is changed only by the owner."
    fi
  done
fi

# --- Files with secrets (Read/Edit/Write/Grep/Glob) ---
for r in "$path" "$search_pattern"; do
  [[ -z "$r" ]] && continue
  if has '(^|/)\.env($|\.)|\.pem$|\.key$|id_rsa|id_ed25519|/\.ssh/|/\.aws/|/\.config/gh/|/\.npmrc$|/\.netrc$|/\.kube/|/\.docker/config' "$r" &&
     ! has '\.env\.example$' "$r"; then
    block "access to a file with secrets ($r)."
  fi
done

# --- Secrets written to files ---
if [[ -n "$content" ]] && printf '%s' "$content" | grep -Eq \
  '(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|gh[ousr]_[A-Za-z0-9]{36}|sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{40,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-[A-Za-z0-9-]{10,}|eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)'; then
  block "the content seems to include a secret or token. Use GitHub Secrets or environment variables."
fi

[[ -z "$cmd" ]] && exit 0

rev_ok() { git rev-parse --verify -q "$1^{commit}" >/dev/null 2>&1; }
# prot_differs <rev or range…>: true if the guardrails differ there, or if git can't tell (fails closed).
prot_differs() { ! git diff --quiet "$@" -- "${prot_top[@]}" >/dev/null 2>&1; }
guard_rev() {  # guard_rev <what> <rev>: refuse when switching to, restoring or resetting to <rev> changes guardrails
  [[ -z "$2" || "$2" == HEAD ]] && return 0
  prot_differs HEAD "$2" &&
    block "$1 '$2' would change the guardrail files (.claude/, .githooks/, .github/…): only the owner does that."
  return 0
}
# opt_prefix <token> <long option> <min length>: git accepts unique prefixes of long options (--no-veri).
# git takes any unique prefix of a long option (--sou=HEAD~1 is --source): spelled out before the rules look,
# and an ambiguous one is refused. long_full "<options>" <token> sets LF.
long_full() {
  local name="${2%%=*}" val="" c hit="" n=0
  LF="$2"; [[ "$2" == *=* ]] && val="=${2#*=}"
  [[ "$name" == --?* ]] || return 0
  for c in $1; do
    [[ "$c" == "$name" ]] && return 0
    [[ "$c" == "$name"* ]] && { hit="$c"; n=$((n + 1)); }
  done
  (( n > 1 )) && block "git option '$name' is ambiguous: write it in full."
  (( n == 1 )) && LF="$hit$val"
  return 0
}
opt_prefix() { local t="${1%%=*}"; (( ${#t} >= $3 )) && [[ "$2" == "$t"* ]]; }
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
# The git commands the agent may run. Anything else (plumbing like send-pack, subtree, aliases from config…) is refused.
git_allowed=" submodule lfs sparse-checkout add annotate apply archive blame branch check-attr check-ignore cherry cherry-pick clean clone
  commit config count-objects describe diff diff-files diff-index diff-tree fetch for-each-ref format-patch fsck gc
  grep help init log ls-files ls-remote ls-tree merge merge-base mv name-rev push range-diff reflog remote reset
  restore rev-list rev-parse revert rm shortlog show show-ref stash status switch tag var version whatchanged worktree
  am rebase hash-object update-index update-ref read-tree write-tree commit-tree mktree replace fast-import
  checkout checkout-index symbolic-ref unpack-objects filter-branch filter-repo notes pull "
git_allowed="${git_allowed//$'\n'/ }"   # one line: a word at the end of a line must match " word " too
# Commands that only print text: a "git" among their arguments is text, not a call to git.
text_only=" echo printf grep egrep fgrep rg ag ack man which type whereis apropos info tldr hash "
# Test runners: a "git" right after one of their options is a test filter (pytest -k git).
test_runners=" pytest jest vitest mocha go cargo "
# Commands that run their operand as a program: a git or gh among their arguments would be a call.
# Commands whose arguments only name things (files, packages, text): a git or gh among them is not a call.
no_run=" for select echo printf grep egrep fgrep rg ag ack man which type whereis apropos info tldr hash brew apt apt-get dnf yum apk port pip pip3 npm pnpm yarn conda ls cp mv rm cat head tail file stat wc less more chmod chown ln mkdir rmdir touch du df diff cmp realpath readlink basename dirname test [ [[ sort uniq cut tr tar zip unzip gzip gunzip shasum md5 md5sum sha256sum strings od hexdump xxd tree jq "
runs_operand=" noglob nocorrect repeat docker podman env nice timeout command builtin exec nohup sudo doas time stdbuf ionice chronic xargs caffeinate arch watch parallel flock unbuffer script setsid taskset chrt strace ltrace dtruss gdb lldb valgrind entr npx pnpx bunx uvx pipx nsenter chroot su runuser eval source . trap alias function "
# tmp_target <path>: an output path inside the temp folder ($TMPDIR, /tmp), with no .. in it.
# The text $TMPDIR is trusted only when the command doesn't mention TMPDIR in any other way (read TMPDIR,
# ${TMPDIR:=…}, for TMPDIR in …), and the real folder (symlinks resolved) must be outside the repository.
tmp_target() {
  local v="${1//$'\x1f'/ }" top real
  [[ "$v" != *..* ]] || return 1
  case "$v" in
    '$TMPDIR'/?*|'${TMPDIR}'/?*)
      [[ -n "${TMPDIR:-}" ]] || return 1
      printf '%s' "$cmd_raw" | sed -E 's/\$\{?TMPDIR\}?\///g' | grep -q TMPDIR && return 1
      v="${TMPDIR%/}/${v#*/}" ;;
    /tmp/?*|/private/tmp/?*) ;;
    *) [[ -n "${TMPDIR:-}" && "$v" == "${TMPDIR%/}"/?* ]] || return 1 ;;
  esac
  real="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$v" 2>/dev/null)" || return 1
  top="$(git rev-parse --show-toplevel 2>/dev/null)"; [[ -n "$top" ]] && top="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$top")"
  [[ -z "$top" || ( "$real" != "$top" && "$real" != "$top"/* ) ]]
}

US=$'\x1f'   # a quoted space inside one word, as the scanner writes it
moved=0
tree_changed=0   # git changed tracked files earlier in this same command
refs_changed=0   # git created or moved refs earlier in this same command (fetch, branch, commit…)
for p in "${parts[@]+"${parts[@]}"}"; do
  p="$(printf '%s' "$p" | sed -E 's/^[[:space:]]+//')"
  [[ -z "$p" ]] && continue
  # --- git: find the real subcommand instead of matching words anywhere in the line ---
  # Tokens are read in order: optional VAR=value prefixes, then git, then global options, then the subcommand.
  # Wrapped or path-qualified git (/usr/bin/git, \git, command git, env git, xargs git…) is refused, so the
  # rules below can't be dodged by spelling git differently.
  ! has '^command +-[vV] +git *$' "$p" &&
  has '(^|[ ;&|(])(command|builtin|exec|nohup|nice|time|timeout|xargs|sudo|doas|env|watch|parallel)( +-[-a-zA-Z]*)*( +[A-Za-z_][A-Za-z0-9_]*=[^ ]*)* +git( |$)' "$p" &&
    block "run git directly, not through a wrapper (env, command, exec, xargs…)."
  has '(^| )-(exec|execdir|ok|okdir) +(git|gh)( |$)' "$p" &&
    block "run git and gh directly, not through find -exec."
  isgit=0; sub=""; rest=""
  read -r -a tok <<< "$p"
  i=0
  while (( i < ${#tok[@]} )) && [[ "${tok[$i]}" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; do i=$((i + 1)); done
  cw="${tok[$i]:-}"
  # The command word must be literal: not built from variables, substitutions or patterns ($g, ${g}t, "$@", g?t…).
  [[ "$(lower "${cw##*/}")" =~ ^git-[a-z] || "$cw" == */git-core/* ]] && ! has '^[^ ]+ +(--help|--version|version)$' "$p" && block "git commands are run as 'git <subcommand>', not as git-<subcommand> or from git-core."
  [[ "${cw##*/}" == sudo || "${cw##*/}" == doas ]] && block "sudo/doas are not used by the agent: ask the owner to run it."
  [[ "$cw" != "[[" && "$cw" != "[" && "$cw" == *[\$\`*?[{]* ]] &&
    block "the command name '$cw' is built from variables or patterns: write the command itself."
  [[ "$cw" == alias ]] && (( ${#tok[@]} > i + 1 )) && block "aliases are not allowed: they hide what a command really does."
  # git anywhere but as the command word (nice git, xargs git, timeout 5 git, function f { git …, =git…) or
  # in another case (GIT push, on a case-insensitive disk) is refused: the rules below only see plain git.
  if [[ "$(lower "$cw")" =~ ^(.*[/=])?git$ && "$cw" != git ]]; then block "call git by its plain name, in lowercase."; fi
  script_args_gh=0
  [[ "${cw##*/}" =~ ^(python[0-9.]*|node|ruby|perl|php|deno|bun)$ ]] && for t in "${tok[@]:$((i + 1))}"; do
    [[ "$t" == -* ]] && continue; [[ "$t" == *[./]* ]] && script_args_gh=1; break; done
  # gh behind a wrapper (env gh, command gh, timeout 5 gh…) would skip the gh list below.
  case "$cw" in gh|git) ;; *)
      if [[ "$no_run" != *" ${cw##*/} "* ]] && (( ! script_args_gh )) && ! has '^command +-[vV] +gh *$' "$p"; then
        for t in "${tok[@]:$((i + 1))}"; do
          [[ "$(lower "$t")" =~ ^(/.*/|\./|=)?gh$ ]] && block "run gh directly, not as an argument of '$cw' (env, command, arch, timeout…)."
        done
      fi ;;
  esac
  # "Text-only" commands that can run a program: rg --pre, ack/ag --pager, man -P/--pager/-H.
  case "${cw##*/}" in
    rg) has '(^| )--pre(=| |$)' " ${tok[*]:$((i + 1))} " && block "rg --pre runs a program on each file: search without it." ;;
    ack|ag) has '(^| )--pager(=| |$)' " ${tok[*]:$((i + 1))} " && block "$cw --pager runs a program: leave it out." ;;
    man) has '(^| )(-P|--pager|-H|--html)' " ${tok[*]:$((i + 1))} " && block "man -P/--pager/-H runs a program: leave it out." ;;
  esac
  # Environment dumps (tokens live there): env/export/declare/typeset/set with no command or only options,
  # printenv, compgen -v/-e, and printing a variable named like a secret.
  args=("${tok[@]:$((i + 1))}"); onlyopts=1; optval=0
  for t in "${args[@]+"${args[@]}"}"; do
    if (( optval )); then optval=0; continue; fi
    # env FOO=1 with no program prints the whole environment; env -S re-splits a word into a command.
    if [[ "${cw##*/}" == env ]]; then
      [[ "$t" == --split-string* || "$t" =~ ^-[a-zA-Z]*S ]] && block "env -S is not allowed: it splits a word into a command the guard can't see."
      [[ "$t" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] && continue
    fi
    case "$t" in -u|--unset|-C|--chdir|-S|--split-string) optval=1; continue ;; esac   # env -u PATH: PATH is the option's value
    [[ "$t" == -* || "$t" == '>'* || "$t" == '|' ]] || { onlyopts=0; break; }
  done
  case "${cw##*/}" in   # also /usr/bin/env, /usr/bin/printenv
    env|export|declare|typeset|readonly|local) (( onlyopts )) && block "dump of environment variables or tokens." ;;
    set) [[ -z "${args[*]:-}" || "${args[0]}" == '>'* || "${args[0]}" == '|' ]] && block "dump of environment variables or tokens." ;;   # set -e / set -o pipefail are fine
    printenv) # printenv NODE_ENV: named variables, none named like a secret
      [[ -n "${args[*]:-}" ]] && ! has '(^| )-|[^A-Za-z0-9_ ]|(TOKEN|SECRET|PASSW|API_?KEY|PRIVATE_KEY|CREDENTIAL)' "${args[*]}" ||
        block "dump of environment variables or tokens (printenv NAME for one non-secret variable is fine)." ;;
    compgen) has '(^| )-[a-zA-Z]*[ve]' "${args[*]:-}" && block "dump of environment variables or tokens." ;;
  esac
  # source/. read a file by name: not stdin, a pipe, /dev/fd or nothing at all.
  if [[ "$cw" == source || "$cw" == . ]]; then
    so="${tok[$((i + 1))]:-}"
    [[ -z "$so" || "$so" == - || "$so" == /dev/stdin* || "$so" == /dev/fd* || "$so" == '<('* || "$so" == *[\$\`]* ]] &&
      block "source/. of stdin, a substitution or a variable runs code the guard can't see: source a file by name."
  fi
  # ps shows environments with -E (dashed) or e in a BSD-style bundle (ps eww); ps -e / -ef only lists processes.
  if [[ "${cw##*/}" == ps ]]; then
    pv=0
    for t in "${tok[@]:$((i + 1))}"; do
      (( pv )) && { pv=0; continue; }
      case "$t" in -[oOpUuGgtqMNC]|--format|--pid|--ppid|--user|--User|--group|--Group|--sort|--cols|--columns|--rows|--sid|--tty|--quick-pid|-[oO]) pv=1; continue ;;
                   -[oOpUuGgtqMNC]?*|--*) continue ;; esac
      [[ "$t" == -* && "$t" == *E* ]] && block "ps -E prints environments (tokens live there)."
      [[ "$t" != -* && "$t" =~ ^[a-zA-Z]+$ && "$t" == *e* ]] && block "ps e prints environments (tokens live there)."
    done
  fi
  [[ "$cw" == declare || "$cw" == typeset ]] && has '(^| )-[a-zA-Z]*p' "${args[*]:-}" && block "dump of environment variables or tokens."
  has '\$\{!|\$\{?[A-Za-z0-9_]*(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_KEY|CREDENTIAL)([^A-Za-z]|_|$)' "$p" &&
    block "printing a variable that holds a secret (or an indirect \${!…} expansion) is not allowed."
  case " echo printf grep egrep fgrep rg ag ack man which type whereis apropos info tldr hash tee yq jq curl wget cat sort uniq wc cut tr sh bash zsh dash ksh mksh ash yash csh tcsh fish pwsh powershell busybox eval git gh " in
    *" ${cw##*/} "*) ;;
    *) if [[ ! "${cw##*/}" =~ ^(python[0-9.]*|node|ruby|perl|php|deno|bun|lua|Rscript|osascript|g?awk|mawk|nawk)$ ]]; then
         re_gs="(^|[^A-Za-z0-9_-])(git|gh)${US}"
         for t in "${tok[@]:$((i + 1))}"; do
           t="${t//\$(*)/}"   # a $(…) inside it is scanned as a command of its own
           # sed s/…/…/ only substitutes text (unless its flags say e or w)
           [[ "${cw##*/}" == sed && "$t" =~ ^s(.).*(.)([gpIiMm0-9]*)$ && "${BASH_REMATCH[1]}" == "${BASH_REMATCH[2]}" ]] && continue
           [[ "$t" == *"$US"* && "$t" =~ $re_gs ]] &&
             block "a command string with git or gh in it, given to '$cw', would run where the guard can't see it: run git/gh directly."
         done
       fi ;;
  esac
  script_args=0   # python3 x.py --backend git: arguments of a script, not a call
  [[ "${cw##*/}" =~ ^(python[0-9.]*|node|ruby|perl|php|deno|bun)$ ]] && for t in "${tok[@]:$((i + 1))}"; do
    [[ "$t" == -* ]] && continue; [[ "$t" == *[./]* ]] && script_args=1; break; done
  if [[ "$cw" != git && "$cw" != gh && "$no_run" != *" ${cw##*/} "* ]] && (( ! script_args )) && ! has '^command +-[vV] +git *$' "$p"; then
    prevt=""; runner=0
    [[ "$test_runners" == *" $cw "* ]] && runner=1
    [[ "$cw" =~ ^python[0-9.]*$ && " ${tok[*]:$((i + 1)):2} " == " -m pytest "* ]] && runner=1   # python3 -m pytest
    for t in "${tok[@]:$((i + 1))}"; do
      # A test filter (pytest -k git, go test -run git, jest -t git) is text for the runner, not a command.
      if (( runner )) && [[ "$prevt" == -* ]]; then prevt="$t"; continue; fi
      prevt="$t"
      [[ "$t" =~ ^[A-Z_][A-Z0-9_]*=git$ ]] && continue   # VCS=git: a value, not a command
      [[ "$(lower "$t")" =~ ^(/.*/|\./|=)?git$ ]] &&
        block "git must be the command itself, not an argument of '$cw' (no wrappers, prefixes, functions or aliases)."
    done
  fi
  # --- gh: it runs outside the sandbox too, so only a list of subcommands is allowed ---
  [[ "$(lower "$cw")" =~ ^(.*/)?gh$ && "$cw" != gh ]] && block "call gh by its plain name, in lowercase."
  if [[ "$cw" == gh ]]; then
    # gh runs outside the sandbox: a body or field file must be in the project or the temp folder.
    bv=0
    for t in "${tok[@]:$((i + 1))}"; do
      if (( bv )); then bv=0; f="$t"; else
        case "$t" in --body-file|--field|--input) bv=1; continue ;;
                     --body-file=*|--input=*|--field=*) f="${t#*=}" ;;
                     --*) continue ;;
                     -*F) [[ "$t" =~ ^-[A-Za-z]*F$ ]] && { bv=1; continue; }; continue ;;
                     -*F?*) [[ "$t" =~ ^-[A-Za-eg-z]*F(.+)$ ]] && f="${BASH_REMATCH[1]}" || continue ;;
                     *) continue ;; esac
      fi
      [[ "$f" == *=@* ]] && f="${f#*=@}"
      case "$f" in /tmp/?*|/private/tmp/?*|/var/folders/?*) [[ "$f" == *..* ]] && block "gh file '$f': no .. in it." ;;
        .[Gg][Ii][Tt]/*|*/.[Gg][Ii][Tt]/*|.[Gg][Ii][Tt]) block "gh reads '$f' from .git: not allowed." ;;
        /*|~*|*'$HOME'*|*'${HOME}'*|*..*) block "gh reads '$f' outside the sandbox: put the text in a file in the project or the temp folder." ;; esac
    done
    gw=(); skipv=0; grepo=""
    for t in "${tok[@]:$((i + 1))}"; do
      if (( skipv )); then [[ "$skipv" == 2 ]] && grepo="$t"; skipv=0; continue; fi
      case "$t" in -R|--repo) skipv=2; continue ;; --repo=*) grepo="${t#*=}"; continue ;; -R?*) grepo="${t#-R}"; continue ;;
                   -H|--hostname) skipv=1; continue ;; -*) continue ;; esac
      (( ${#gw[@]} < 2 )) && gw+=("$t")   # every token is read: -R may come after the subcommand
    done
    g1="${gw[0]:-}"; g2="${gw[1]:-}"
    # The repository this project pushes to (origin), as owner/name: writes go only there.
    origin_repo="$(git config --get remote.origin.url 2>/dev/null | sed -E 's#\.git$##; s#^.*[:/]([^/:]+/[^/:]+)$#\1#' || true)"
    # Writing to another repository (an issue, a PR, a comment) would carry the project's text out.
    if [[ -n "$grepo" && "$g1" =~ ^(pr|issue)$ && ! "$g2" =~ ^(view|list|checks|diff|status)$ ]] &&
       [[ -z "$origin_repo" || "$(lower "${grepo#https://github.com/}")" != "$(lower "$origin_repo")" ]]; then
      block "gh $g1 $g2 writes only to this repository ($origin_repo): not to '$grepo'."
    fi
    # gh api: a write (fields, --input, or a method other than GET) goes only to this repository's endpoints
    # (repos/<origin>/… or repos/{owner}/{repo}/…) or to graphql (queries only, checked below): a gist, a new
    # repository or another repository's issue would carry the project's text out.
    if [[ "$g1" == api ]]; then
      ep=""; nv=""; write=0; get=0; seen=0
      for t in "${tok[@]:$((i + 1))}"; do
        if [[ -n "$nv" ]]; then
          if [[ "$nv" == method ]]; then if [[ "$(lower "$t")" == get ]]; then get=1; else write=1; fi; fi
          [[ "$nv" == field ]] && write=1
          nv=""; continue
        fi
        case "$t" in
          -X|--method) nv=method ;;
          --method=*) if [[ "$(lower "${t#*=}")" == get ]]; then get=1; else write=1; fi ;;
          -f|-F|--field|--raw-field|--input) nv=field ;;
          --field=*|--raw-field=*|--input=*) write=1 ;;
          -H|--header|--hostname|-q|--jq|-t|--template|-p|--preview|--cache|-R|--repo) nv=other ;;
          --*) ;;
          -*X*) [[ "$t" =~ X(.*)$ ]]; v="${BASH_REMATCH[1]}"
                if [[ -z "$v" ]]; then nv=method; elif [[ "$(lower "$v")" == get ]]; then get=1; else write=1; fi ;;
          -*[fF]*) write=1; [[ "$t" =~ [fF]$ ]] && nv=field ;;
          -*) ;;
          *) if (( ! seen )) && [[ "$t" == api ]]; then seen=1; elif [[ -z "$ep" ]]; then ep="$t"; fi ;;
        esac
      done
      el="$(lower "${ep#/}")"
      if (( write && ! get )) && [[ "$el" != graphql ]] && [[ "$el" != "repos/{owner}/{repo}/"* ]] &&
         [[ -z "$origin_repo" || "$el" != "repos/$(lower "$origin_repo")/"* ]]; then
        block "gh api writes only to this repository (repos/${origin_repo:-<origin>}/… or repos/{owner}/{repo}/…): not to '${ep:-?}'."
      fi
    fi
    case "$g1:$g2" in
      pr:create|pr:view|pr:list|pr:checks|pr:diff|pr:status|pr:comment|pr:ready|pr:edit|\
      issue:create|issue:view|issue:list|issue:comment|issue:edit|issue:close|issue:reopen|issue:status|\
      run:view|run:list|run:watch|run:rerun|workflow:view|workflow:list|repo:view|release:view|release:list|\
      label:list|search:*|status:*|help:*|version:*|api:*|auth:status|browse:*|:) ;;
      pr:review)
        rv=0; rc=0; rbad=0
        for t in "${tok[@]}"; do
          (( rv )) && { rv=0; continue; }
          case "$t" in
            -b|--body|-F|--body-file|-R|--repo) rv=1 ;;
            -c|--comment) rc=1 ;;
            --body=*|--body-file=*|--repo=*) ;;
            -a|--approve|-r|--request-changes|--approve=*|--request-changes=*|--comment=*) rbad=1 ;;
            --*) ;;
            -?*) rbad=1 ;;   # bundles (-ab, -cb…) and attached values: written out, so each flag is seen
          esac
        done
        (( rc && ! rbad )) ||
          block "gh pr review only with --comment, flags written separately (-c -b \"…\"): approving or requesting changes is the code owner's." ;;
      *) block "gh $g1 $g2 is not on the list of gh commands the agent may run (it runs outside the sandbox): see .claude/hooks/guard.sh." ;;
    esac
  fi
  if (( i < ${#tok[@]} )) && [[ "${tok[$i]}" == "git" ]]; then
    isgit=1
    (( i > 0 )) && block "no VAR=value before git: they can change what git does."
    i=$((i + 1))
    while (( i < ${#tok[@]} )) && [[ "${tok[$i]}" == -* ]]; do
      case "${tok[$i]}" in
        -C) i=$((i + 2)) ;;
        --no-pager|-P|--no-optional-locks|--version|--help) i=$((i + 1)) ;;
        *) block "git global option '${tok[$i]}' is not allowed (only -C, --no-pager and --no-optional-locks)." ;;
      esac
    done
    sub="${tok[$i]:-}"
    rt=("${tok[@]:$((i + 1))}")
    case "$sub" in
      checkout) lopts="--quiet --progress --no-progress --force --ours --theirs --track --no-track --guess --no-guess --detach --orphan --ignore-skip-worktree-bits --merge --conflict --patch --ignore-other-worktrees --overwrite-ignore --no-overwrite-ignore --recurse-submodules --no-recurse-submodules --overlay --no-overlay --pathspec-from-file --pathspec-file-nul" ;;
      switch) lopts="--create --force-create --detach --guess --no-guess --force --discard-changes --merge --conflict --quiet --progress --no-progress --track --no-track --orphan --ignore-other-worktrees --recurse-submodules --no-recurse-submodules" ;;
      restore) lopts="--source --patch --worktree --staged --quiet --progress --no-progress --ours --theirs --merge --conflict --ignore-unmerged --ignore-skip-worktree-bits --recurse-submodules --no-recurse-submodules --overlay --no-overlay --pathspec-from-file --pathspec-file-nul" ;;
      reset) lopts="--soft --mixed --hard --merge --keep --quiet --no-quiet --refresh --no-refresh --recurse-submodules --no-recurse-submodules --patch --intent-to-add --pathspec-from-file --pathspec-file-nul" ;;
      merge) lopts="--commit --no-commit --edit --no-edit --cleanup --ff --no-ff --ff-only --log --no-log --signoff --no-signoff --stat --no-stat --squash --no-squash --verify --no-verify --strategy --strategy-option --verify-signatures --no-verify-signatures --summary --no-summary --quiet --verbose --progress --no-progress --autostash --no-autostash --allow-unrelated-histories --rerere-autoupdate --no-rerere-autoupdate --overwrite-ignore --no-overwrite-ignore --abort --quit --continue --message --file --into-name --gpg-sign --no-gpg-sign" ;;
      commit) lopts="--all --patch --reuse-message --reedit-message --fixup --squash --reset-author --short --branch --porcelain --long --null --file --author --date --message --template --signoff --no-signoff --trailer --no-verify --verify --allow-empty --allow-empty-message --cleanup --edit --no-edit --amend --no-post-rewrite --include --only --pathspec-from-file --pathspec-file-nul --untracked-files --verbose --quiet --dry-run --status --no-status --gpg-sign --no-gpg-sign" ;;
      branch) lopts="--move --copy --force --delete --merged --no-merged --contains --no-contains --column --no-column --color --no-color --create-reflog --no-create-reflog --format --list --all --remotes --verbose --quiet --abbrev --no-abbrev --track --no-track --set-upstream-to --unset-upstream --edit-description --points-at --sort --ignore-case --omit-empty --show-current --recurse-submodules" ;;
      *) lopts="" ;;
    esac
    if [[ -n "$lopts" ]]; then
      nrt=(); dd=0
      for t in "${rt[@]+"${rt[@]}"}"; do
        if (( dd )) || [[ "$t" == -- ]]; then dd=1; nrt+=("$t"); continue; fi
        long_full "$lopts" "$t"; nrt+=("$LF")
      done
      rt=("${nrt[@]+"${nrt[@]}"}")
    fi
    rest="${rt[*]+"${rt[*]}"}"
    [[ "$sub" == diff || "$sub" == grep ]] && for t in "${rt[@]+"${rt[@]}"}"; do
      [[ "$t" == --no-i* ]] && opt_prefix "$t" --no-index 6 && block "git $sub --no-index (even abbreviated) reads files outside the repository."; done
    [[ "$sub" == diff || "$sub" == grep ]] && has '(^| )--no-index( |$)' "$rest" &&
      block "git $sub --no-index reads files outside the repository (git runs outside the sandbox)."
    [[ "$sub" == reset ]] && has '(^| )--hard( |$)' "$rest" && block "command that destroys work or rewrites history. Ask the owner for confirmation."
    # git worktree move could put a worktree inside a guardrail folder (git runs outside the sandbox).
    [[ "$sub" == worktree ]] && has '^(-[^ ]+ +)*move( |$)' "$rest" && block "git worktree move is not allowed: remove and add it again."
    [[ -n "$sub" && "$git_allowed" != *" $sub "* ]] &&
      block "git $sub is not on the list of git commands the agent may run (see .claude/hooks/guard.sh)."
    # Options that write a file wherever they are told (--output, -o) or run a program of the caller's choice
    # (--upload-pack, --receive-pack, --exec, grep -O, clone/init --template or -c): git runs outside the
    # sandbox, so these would write the guardrails or .git/config, or run anything unsandboxed.
    has 'TMPDIR=' "$cmd_code" && has '(^| )(-o|--output)' "$rest" && block "TMPDIR can't be set in a command that writes git output."
    # Every git argument is checked as written, so it must be written out: an option, path or revision taken
    # from a variable or a substitution ("$o", $(…)) would be checked as the text "$o". Only "$TMPDIR/…"
    # (for git output) is allowed, and tmp_target checks it.
    for t in "${tok[@]:1:$((i - 1))}"; do   # global options (-C <dir>…)
      [[ "$t" == *[\$\`]* ]] && block "git arguments must be written out, not taken from variables or substitutions ('$t')."
    done
    prevt=""
    for t in "${rt[@]+"${rt[@]}"}"; do
      pt="$prevt"; prevt="$t"
      [[ "$t" == *[\$\`]* ]] || continue
      # "$TMPDIR/…" only as the value of an output option (-o, --output, --output-directory); tmp_target checks it.
      if [[ "$t" =~ ^(-o|--output(-directory)?=)\$\{?TMPDIR\}?/[^\$\`]*$ ]] ||
         { [[ "$pt" == -o || "$pt" == --output || "$pt" == --output-directory ]] && [[ "$t" =~ ^\$\{?TMPDIR\}?/[^\$\`]*$ ]]; }; then
        continue
      fi
      block "git arguments must be written out, not taken from variables or substitutions ('$t'): the guard checks them as written."
    done
    k=0
    for t in "${rt[@]+"${rt[@]}"}"; do
      k=$((k + 1)); nxt="${rt[$k]:-}"
      [[ "$t" == MSG ]] && continue
      # Paths read from a file (or stdin) are hidden from the checks below.
      [[ "$t" == --* ]] && opt_prefix "$t" --pathspec-from-file 12 &&
        block "git $sub --pathspec-from-file is not allowed: name the paths in the command so the guard can check them."
      # --output / -o into the temp folder is fine (git format-patch -o "$TMPDIR/patches"); anywhere else it is
      # refused, since git runs outside the sandbox and could write the guardrails or .git/config.
      if [[ "$t" == --* ]] && opt_prefix "$t" --output-directory 5; then
        if [[ "$t" == *=* ]]; then val="${t#*=}"; else val="$nxt"; fi
        tmp_target "$val" && continue
      fi
      case "$sub:$t" in archive:-o?*|format-patch:-o?*) tmp_target "${t#-o}" && continue ;;
                        archive:-o|format-patch:-o) tmp_target "$nxt" && continue ;; esac
      [[ "$t" == --* ]] && { opt_prefix "$t" --output-directory 5 || opt_prefix "$t" --upload-pack 5 ||
        opt_prefix "$t" --receive-pack 5 || opt_prefix "$t" --exec 5 || opt_prefix "$t" --open-files-in-pager 4 ||
        { [[ "$sub" == clone || "$sub" == init ]] && { opt_prefix "$t" --template 5 || opt_prefix "$t" --config 5 ||
          opt_prefix "$t" --separate-git-dir 4; }; }; } &&
        block "git $sub ${t%%=*} is not allowed: it writes a file or runs a program outside the sandbox."
      case "$sub:$t" in archive:-o*|format-patch:-o*|clone:-u*|ls-remote:-u*|grep:-O*|clone:-c*|init:-c*)
        block "git $sub ${t:0:2} is not allowed: it writes a file or runs a program outside the sandbox." ;; esac
    done
    # Broad pathspecs (git rm -r ., git mv src dst): resolved with git itself, refused if they reach a guardrail.
    if [[ "$sub" == rm || "$sub" == mv ]]; then
      ps=(); for t in "${rt[@]+"${rt[@]}"}"; do [[ "$t" == -* ]] || ps+=("${t//$'\x1f'/ }"); done
      [[ "$sub" == mv ]] && (( ${#ps[@]} > 1 )) && unset 'ps[${#ps[@]}-1]'   # git mv's last operand is the destination
      if (( ${#ps[@]} )); then
        hit="$(git -c core.quotepath=false ls-files -- "${ps[@]}" 2>/dev/null)" || hit=""
        has "$protected_files_re" "$hit" && block "git $sub would touch guardrail files ($(printf '%s' "$hit" | grep -E "$protected_files_re" | head -3 | tr '\n' ' ')): only the owner does that."
      fi
    fi
    if [[ "$sub" == clone || "$sub" == init ]] || { [[ "$sub" == worktree ]] && has '^add( |$)' "$rest"; }; then
      (( moved )) && block "git $sub after a cd or a branch change in the same command: run it as a command of its own, so the guard resolves its destination from the real directory."
      # Every operand that isn't an option or a URL could be the destination (option values included: a superset
      # is safe), plus the folder clone makes from the URL, all relative to -C and the current directory.
      cdir=""; for ((q = 1; q < i; q++)); do [[ "${tok[$q]}" == -C ]] && cdir="${cdir:+$cdir/}${tok[$((q + 1))]}"; done
      ops=()
      for t in "${rt[@]+"${rt[@]}"}"; do
        [[ "$t" == -* || ( "$sub" == worktree && "$t" == add ) ]] && continue
        if [[ "$t" == *://* || "$t" == *@*:* ]]; then [[ "$sub" == clone ]] && { b="${t%/}"; b="${b##*/}"; implicit="${b%.git}"; }; continue; fi
        ops+=("${t//$'\x1f'/ }")
      done
      # The folder clone names after the URL is the destination only when none is given.
      [[ "$sub" == clone && ${#ops[@]} -eq 0 && -n "${implicit:-}" ]] && ops+=("$implicit")
      implicit=""
      [[ "$sub" == init ]] && (( ${#ops[@]} == 0 )) && ops+=(.)
      for t in "${ops[@]+"${ops[@]}"}"; do
        nt="$(python3 -c '
import os, subprocess, sys
p = os.path.realpath(os.path.join(sys.argv[2] or ".", sys.argv[1]))
top = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip()
print(os.path.relpath(p, os.path.realpath(top)) if top else os.path.normpath(sys.argv[1]))' "$t" "$cdir" 2>/dev/null)" || nt="$t"
        has "$protected_files_re|(^|/)\.git(/|$)|(^|/)\.(githooks|github|devcontainer)(/|$)|(^|/)\.claude$" "$nt" &&
          block "git $sub into a guardrail folder ('$t') is not allowed."
      done
    fi
    # -C points git at another repository, whose branch the rules below don't see: not for changing commands.
    # (allow-list: rm, mv, restore, stash… resolve their paths from here, not from the -C directory)
    case "$sub" in status|log|diff|show|grep|ls-files|ls-tree|rev-parse|rev-list|blame|annotate|cat-file|describe|shortlog|show-ref|for-each-ref|merge-base|name-rev|check-ignore|check-attr|version|help) ;;
      *) has '(^| )-C( |$)' "${tok[*]:0:$i}" && block "git -C is only allowed for reading (status, log, diff, show…); cd into the repository instead." ;;
    esac
  fi

  # Revisions are checked as they are now: after a fetch, a new branch or a commit in the same command they
  # may name other commits by the time this part runs.
  if (( isgit && refs_changed )); then
    case "$sub" in reset|merge|checkout|switch|restore|cherry-pick|revert|worktree|stash|branch|tag)
      block "run git $sub as a command of its own after git fetch, branch, tag or commit: the guard checks revisions as they are before the command runs." ;;
    esac
  fi
  if (( isgit && tree_changed )); then
    case "$sub" in commit|push|merge)
      block "run git $sub as a command of its own after changing files with git: the guard (and its tripwire) must see the result first." ;;
    esac
  fi
  if (( isgit )); then
    case "$sub" in
      # Plumbing and history rewriting: they write objects, the index or refs without the git hooks seeing it.
      hash-object|update-index|update-ref|read-tree|write-tree|commit-tree|mktree|replace|fast-import|\
      checkout-index|symbolic-ref|unpack-objects|filter-branch|filter-repo|notes|am|rebase)
        block "git $sub is not allowed: it changes commits, the index or refs without going through the git hooks." ;;
      cherry-pick|revert)
        has '(^| )--std' "$rest" && block "git $sub --stdin is not allowed: name the commits, so the guard can check them."
        has '(^| )(--no-commit|-n)( |$)' "$rest" ||
          block "git $sub only with --no-commit, then a normal git commit (so the hooks run)."
        for t in "${rt[@]+"${rt[@]}"}"; do
          [[ "$t" == -* || "$t" == MSG ]] && continue
          if [[ "$t" == *..* ]]; then a="${t%%..*}"; b="${t##*..}"; a="${a:-HEAD}"; b="${b:-HEAD}"
            rev_ok "$a" && rev_ok "$b" || continue; prot_differs "$a" "$b"
          else rev_ok "$t" || continue; prot_differs "$t^" "$t"; fi && block "git $sub of '$t' would change the guardrail files: only the owner does that."
        done ;;
      apply)
        has '(^| )--(cached|index)( |$)' "$rest" && block "git apply --cached/--index is not allowed: apply to the working tree and commit normally."
        has '(^| )(--directory|-p[0-9]*|--include|--exclude)' "$rest" && block "git apply with --directory, -p, --include or --exclude is not allowed."
        files=(); for t in "${rt[@]+"${rt[@]}"}"; do [[ "$t" == -* ]] || files+=("$t"); done
        (( ${#files[@]} )) || block "git apply reads the patch from a file you name, so the guard can check what it touches."
        touched="$(git apply --numstat -z -- "${files[@]}" 2>/dev/null | tr '\0\t' '\n\n')" || block "git apply: could not read the patch."
        has "$protected_files_re|(^|/)\.git/" "$touched" && block "this patch changes guardrail files: only the owner applies it." ;;
      checkout|switch|restore|reset|worktree)
        # Recreating main locally, or checking it out in another worktree.
        if has '(^| )(main|master)( |$)' "$rest"; then
          case "$sub" in
            switch) has '(^| )(-[a-zA-Z]*C|--force-create)( |$)' "$rest" && block "main is not recreated locally." ;;
            checkout) has '(^| )-[a-zA-Z]*B( |$)' "$rest" && block "main is not recreated locally." ;;
            worktree) has '^add( |$)' "$rest" && block "main is not checked out in another worktree: commits there would skip the branch check." ;;
          esac
        fi
        # Switching to, restoring from or resetting to another revision rewrites files from it: refused when
        # that revision's guardrails differ (git checkout HEAD~1 .claude/hooks/guard.sh, git switch old-branch…).
        target=""; create=0; prev=""; paths=(); dashdash=0
        for t in "${rt[@]+"${rt[@]}"}"; do
          if (( dashdash )); then paths+=("$t"); continue; fi
          [[ "$t" == -- ]] && { dashdash=1; continue; }
          [[ "$sub" == switch && "$t" == --orphan* ]] && block "git switch --orphan removes every tracked file, the guardrails too: the owner does that."
          case "$prev" in -b|-B|--orphan|-c|-C|--create|--force-create) prev="$t"; create=1; continue ;;
                          -s|--source) target="$t"; prev=""; continue ;; esac
          case "$t" in --source=*) target="${t#--source=}" ;; -s?*) [[ "$sub" == restore ]] && target="${t#-s}" ;;
                       -) target="@{-1}" ;; -*) ;;
                       *) if [[ -z "$target" ]] && { { [[ "$sub" == worktree && "$t" == add ]]; } || { rev_ok "$t" && target="$t"; } ||
                            { [[ "$sub" == switch && $create == 0 ]] && rev_ok "origin/$t" && target="origin/$t"; }; }; then :
                          elif [[ "$sub" != switch && "$sub" != worktree ]]; then paths+=("$t"); fi ;; esac
          prev="$t"
        done
        if [[ "$sub" == checkout || "$sub" == restore ]]; then
          for t in "${paths[@]+"${paths[@]}"}"; do
            case "$t" in .|./|:/|'*'|':/*'|'./*'|':(top)')
              { [[ "$sub" == checkout ]] || ! printf '%s' "$rest" | grep -Eq -- '(^| )(--staged|-S)( |$)' ||
                printf '%s' "$rest" | grep -Eq -- '(^| )(--worktree|-W)( |$)'; } &&   # case-sensitive: -s is --source
                block "discarding every uncommitted change (git $sub … .) is the owner's call: name the files." ;; esac
          done
          [[ "$sub" == checkout ]] && has '(^| )(-[a-zA-Z]*f[a-zA-Z]*|--force)( |$)' "$rest" &&
            block "git checkout -f discards uncommitted changes: ask the owner."
        fi
        if [[ -n "$target" && "$target" != HEAD ]] && (( ${#paths[@]} )); then
          # Only the named paths are rewritten: refused if any guardrail file among them would change.
          names="$(git diff --name-only HEAD "$target" -- "${paths[@]}" 2>/dev/null)" ||
            block "git $sub: could not tell which files '$target' would change."
          has "$protected_files_re" "$names" && block "git $sub from '$target' would change guardrail files: only the owner does that."
        else
          guard_rev "git $sub to" "$target"
        fi
        # reset moves the branch without any hook: only back to HEAD or one of its ancestors, never onto
        # commits made elsewhere (a fetched ref) that no hook checked.
        if [[ "$sub" == reset && -n "$target" && "$target" != HEAD ]] && ! git merge-base --is-ancestor "$target" HEAD 2>/dev/null; then
          block "git reset only to HEAD or an earlier commit of this branch: '$target' would bring commits no git hook checked."
        fi
        if [[ "$sub" == worktree ]] && has '^add( |$)' "$rest"; then
          last="${rt[${#rt[@]}-1]}"; rev_ok "$last" && guard_rev "git worktree add of" "$last"
        fi ;;
      stash)
        if has '^(apply|pop|branch)( |$)' "$rest"; then
          ref="stash@{0}"; k=0
          for t in "${rt[@]:1}"; do [[ "$t" == -* ]] && continue; k=$((k + 1))
            if [[ "${rt[0]}" == branch ]]; then (( k == 2 )) && ref="$t"; else ref="$t"; fi; done
          prot_differs "$ref^" "$ref" && block "this stash changes guardrail files: only the owner applies it."
        fi ;;
      commit)
        has '(^| )(--no-verify|-[a-zA-Z]*n[a-zA-Z]*)( |$)' "$rest" && block "git hooks cannot be skipped (--no-verify, -n)."
        has '(^| )--author' "$rest" && block "the commit author is not changed."
        for t in "${rt[@]+"${rt[@]}"}"; do
          [[ "$t" == --* ]] || continue
          opt_prefix "$t" --no-verify 6 && block "git hooks cannot be skipped (--no-verify, even abbreviated)."
          opt_prefix "$t" --author 4 && block "the commit author is not changed."
        done
        (( moved )) && block "change branch or directory as a command of its own, then commit: the guard checks the branch as it is now."
        [[ "$(git branch --show-current 2>/dev/null)" =~ ^(main|master)$ ]] && block "no commits on main. Use: git switch development" ;;
      branch)
        # Moving, renaming, copying or overwriting main locally.
        has '(^| )(main|master)( |$)' "$rest" && has '(^| )(-[a-zA-Z]*[mMcCf][a-zA-Z]*|--(move|copy|force))( |$)' "$rest" &&
          block "main is not moved, renamed or overwritten locally."
        # Forcing a branch onto another commit puts commits on it that no hook checked.
        printf '%s' "$rest" | grep -Eq -- '(^| )(-[a-zA-Z]*[fCM][a-zA-Z]*|--force)( |$)' &&   # case-sensitive: -m and -c are fine
          block "git branch -f/-C/-M is not allowed: it points a branch at commits the git hooks never checked." ;;
      merge)
        has '(^| )--no-verify( |$)' "$rest" && block "git hooks cannot be skipped (--no-verify)."
        for t in "${rt[@]+"${rt[@]}"}"; do
          [[ "$t" == --* ]] && opt_prefix "$t" --no-verify 6 && block "git hooks cannot be skipped (--no-verify, even abbreviated)."
          [[ "$t" == -* || "$t" == MSG ]] && continue
          rev_ok "$t" && prot_differs "HEAD...$t" && block "merging '$t' brings guardrail changes: the owner merges it."
        done
        # A fast-forward creates no merge commit, so no hook would check what it brings in (--no-commit alone can
        # still fast-forward).
        has '(^| )(--no-ff|--abort|--continue|--quit)( |$)' "$rest" ||
          block "git merge only with --no-ff (add --no-commit to commit it yourself), so the git hooks check the result."
        has '(^| )--ff(-only)?( |$)' "$rest" && block "git merge --ff/--ff-only is not allowed: use --no-ff." ;;
      fetch)
        # Only "git fetch [options] [origin [branch…]]": a refspec (x:refs/heads/development) or
        # --update-head-ok could move the checked-out branch, and the hook runs from HEAD.
        np=0
        for t in "${rt[@]+"${rt[@]}"}"; do
          case "$t" in
            --prune|-p|--prune-tags|-P|--tags|-t|--no-tags|--dry-run|-v|--verbose|-q|--quiet|--unshallow|--progress|--no-progress|--depth=[0-9]*|--jobs=[0-9]*) continue ;;
            -*) block "git fetch $t is not allowed: plain git fetch [--prune] [origin [branch]] only." ;;
          esac
          np=$((np + 1))
          if (( np == 1 )); then [[ "$t" == origin ]] || block "git fetch only from origin (not '$t'): the owner decides where code comes from."
          else [[ "$t" =~ ^[A-Za-z0-9._/-]+$ ]] || block "git fetch of '$t': name branches only, no refspecs (src:dst, +, *)."; fi
        done ;;
      pull)
        block "git pull is not allowed: use git fetch, then git merge --no-ff, so the hooks check the merge." ;;
      push)
        # Allow-list: plain "git push" from a work branch, or "git push [-u] origin <development | feat/… fix/…>".
        has '[$`]' "$cmd_code" && block "git push with variables or command substitution is not allowed: write the branch name."
        work_branch_re='(development|(feat|fix|docs|chore|refactor|test|ci)/[A-Za-z0-9._-]+)'
        if [[ -z "$rest" ]]; then
          (( moved )) && block "change branch or directory as a command of its own, then push: the guard checks the branch as it is now."
          branch="$(git branch --show-current 2>/dev/null || true)"
          [[ "$branch" =~ ^${work_branch_re}$ ]] ||
            block "you are on '${branch:-a detached HEAD}': plain git push is only allowed from development or a work branch."
        elif ! has "^((-u|--set-upstream) +)?origin +${work_branch_re} *$" "$rest"; then
          block "only 'git push [-u] origin development' (or a feat/, fix/… work branch) is allowed. No refspecs, force, other remotes or main."
        fi ;;
      remote|ls-remote)
        [[ "$sub" == remote ]] && has '^(-[^ ]+ +)*(add|set-url|rename|remove|rm|set-head|set-branches)( |$)' "$rest" &&
          block "git remotes are not changed: the owner decides where the code goes."
        # Printing remote URLs (remote -v, get-url, show, ls-remote --get-url) when one has a token in it.
        if has '(^| )(-v|--verbose|get-url|show|--get-url)( |$)' "$rest" &&
           git config --get-regexp '^remote\..*\.(url|pushurl)$' 2>/dev/null | grep -Eiq 'https?://[^/@ ]+@|[a-z][a-z0-9+.-]*://[^/@ :]+:[^/@ ]+@'; then
          block "a remote URL here has credentials in it, so it is not printed: the owner should move them to a credential helper."
        fi ;;
      lfs)
        has '^(pull|fetch|ls-files|status|track|untrack|version)( |$)' "$rest" || block "git lfs only for pull, fetch, ls-files, status, track, untrack or version." ;;
      sparse-checkout)
        has '^list( |$)' "$rest" || block "git sparse-checkout only for list: changing it is the owner's." ;;
      submodule)
        has '^(status|summary)( |$)' "$rest" || block "git submodule only for status or summary: changing submodules is the owner's." ;;
      var)
        has '(^| )-l( |$)' "$rest" && block "git var -l lists the whole config, which could print credentials: name the variable." ;;
      config)
        # Read-only for the agent, except the owner's identity and the hooks path with their exact values.
        if has '(^| )(--get|--get-all|--get-regexp|--get-urlmatch|--list|-l)( |$)' "$rest" ||
           has '^((--(global|local|system|worktree|show-origin|null|name-only)|--type[= ][a-z]+) +)*[A-Za-z0-9._-]+ *$' "$rest"; then
          # One key at a time: a listing could print credentials (URLs with a token, http.extraHeader…).
          has '(^| )(--get-regexp|--get-urlmatch|--list|-l|list)( |$)' "$rest" && ! has '(^| )--name-only( |$)' "$rest" &&
            block "git config reads one key at a time (git config --get user.email): a listing could print credentials. --name-only --list shows just the names."
          ckey=""; nk=0; skipv=0
          for t in "${rt[@]+"${rt[@]}"}"; do
            if (( skipv )); then skipv=0; continue; fi
            [[ "$t" == --type || "$t" == --file || "$t" == -f || "$t" == --blob ]] && { skipv=1; continue; }
            [[ "$t" == -* || "$t" == get ]] && continue
            nk=$((nk + 1)); (( nk == 1 )) && ckey="$t"
          done
          (( nk > 1 )) && block "git config reads take one key and no value pattern: git config --get <key>."
          has 'credential|extraheader|password|passwd|token|secret|cookie' "$ckey" &&
            block "git config '$ckey' may hold a credential: it is not read from the shell."
          [[ -n "$ckey" ]] && git config --get-all -- "$ckey" 2>/dev/null | grep -Eiq 'https?://[^/@ ]+@|[a-z][a-z0-9+.-]*://[^/@ :]+:[^/@ ]+@|authorization|bearer|ghp_|github_pat_|gh[ousr]_' &&
            block "git config '$ckey' holds a credential (a URL with a token or an auth header): it is not printed."
          :
        else
          # Each allowed value is bound to its own key: core.hooksPath can only be .githooks, and the identity only
          # the owner's, as .github/OWNER says in the project's last commit (a changed copy on disk doesn't count).
          own="$(git -C "$proj" show HEAD:.github/OWNER 2>/dev/null)"
          o_email="$(printf '%s\n' "$own" | sed -n 's/^email=//p' | head -n 1)"
          o_name="$(printf '%s\n' "$own" | sed -n 's/^name=//p' | head -n 1)"
          cfg="$(printf '%s' "${rest//$US/ }" | tr -s ' ' | sed -E 's/^--(global|local) //; s/ $//')"   # "Ada Owner" is one word
          { [[ -n "$o_email" && "$cfg" == "user.email $o_email" ]] ||
            [[ -n "$o_name" && "$cfg" == "user.name $o_name" ]] ||
            has '^(--local +)?core\.hooksPath +\.githooks *$' "$rest"; } ||
            block "git config is read-only for the agent: only reads, or the owner's identity and .githooks, are allowed."
        fi ;;
    esac
  fi
  # The commit author can't be changed through the environment either.
  has 'GIT_(AUTHOR|COMMITTER)_(NAME|EMAIL)' "$p" &&
    block "the commit author is not changed."
  # From here on in this command the branch or directory may differ from what the hook sees.
  if (( isgit )); then
    case "$sub" in
      switch|checkout|worktree) moved=1; tree_changed=1 ;;
      rm|mv|apply|restore|reset|stash|clean|cherry-pick|revert) tree_changed=1 ;;
      branch) has '(^| )(-[a-zA-Z]*[mMcCf][a-zA-Z]*|--(move|copy|force))( |$)' "$rest" && moved=1
              printf '%s' "$rest" | grep -Eq -- '(^| )(-u|-t|--set-upstream-to(=|$)|--track(=|$)|--unset-upstream)' && moved=1 ;;   # upstream changes where a plain push goes
    esac
    case "$sub" in
      fetch|commit|checkout|switch|merge|cherry-pick|revert|reset|clone) refs_changed=1 ;;
      # branch/tag/stash/worktree/remote only when they create or move something (not --list, --show-current…)
      branch|tag)
        if [[ -n "${rest// /}" ]] && ! has '(^| )(-l|--list|-v|-vv|--verbose|-a|--all|-r|--remotes|--show-current|--contains|--no-contains|--merged|--no-merged|--points-at|-n[0-9]*|--format(=| |$)|--sort(=| |$)|--column|--verify)( |=|$)' "$rest"; then
          refs_changed=1
        fi ;;
      stash) has '^(list|show|create)( |$)' "$rest" || refs_changed=1 ;;
      worktree) has '^add( |$)' "$rest" && refs_changed=1 ;;
      remote) has '^(-[^ ]+ +)*(add|set-url|rename|update)( |$)' "$rest" && refs_changed=1 ;;
    esac
  elif [[ " ${tok[*]:-} " =~ \ (cd|pushd|popd)\  ]]; then
    # Any cd, also behind builtin/command (builtin cd …): the rest of the command may run in another repo.
    moved=1
  fi
done

# --- git environment overrides, gh aliases and the owner's guardrail switch ---
# GIT_CONFIG_COUNT/KEY/VALUE, GIT_DIR, GIT_INDEX_FILE… change what git does without any git option in sight.
# Checked on the scanned commands (cmd_code), so a commit message that mentions "PATH=" is not taken for one.
has '(^|[ ;&|])(export +|declare +-x +|typeset +-x +)?GIT_[A-Z_]+=' "$(printf '%s' "$cmd_code" | sed -E 's/(--build-arg|--env|-e)[ =]GIT_/\1 BUILD_GIT_/g')" &&
  block "git environment variables (GIT_*) cannot be set: they override the repository's config, index or hooks."
has '(^|[ ;&|(])(export +|declare +-x +|typeset +-x +)?(PATH|BASH_ENV|ZDOTDIR|LD_PRELOAD|DYLD_[A-Z_]+|PROMPT_COMMAND|GITLEAKS_[A-Z_]+|GH_REPO|GH_HOST)=' "$cmd_code" &&
  block "PATH, BASH_ENV, loader, GITLEAKS_* and GH_REPO/GH_HOST variables can't be set: they change which programs and hooks actually run, what the secret scan reads and which repository gh writes to."
has '(^|[ ;&|(])(export +|declare +-x +|typeset +-x +)?(PAGER|GH_PAGER|MANPAGER|MANOPT|EDITOR|VISUAL|GH_EDITOR|BROWSER|GH_BROWSER|RIPGREP_CONFIG_PATH|ACK_PAGER|ACKRC)=' "$(printf '%s' "$cmd_code" | sed -E 's/(^|[ ;&|(])(GH_)?PAGER=cat( |$)/\1\3/g')" &&
  block "pager, editor and browser variables can't be set (only PAGER=cat or GH_PAGER=cat): gh and man would run that program outside the sandbox."
has '[$<>]\((.*[^A-Za-z0-9_])?git([^A-Za-z0-9_-]|$)|`([^`]*[^A-Za-z0-9_`])?git([^A-Za-z0-9_-]|$)' "$(printf '%s' "$cmd_code" | tr '\037' ' ' | sed -E 's/\$\(git +(rev-parse|describe|log|show|status|diff|ls-files|rev-list|merge-base|branch +--show-current)( [^)$`;&|]*)?\)/RO/g')" &&
  block "git inside a command substitution (\$(…) or backticks) is not allowed: run it as its own command."
has '(^|[ ;&|])gh +alias( |$)' "$cmd" &&
  block "gh aliases are not allowed: they hide what a command really does."
has 'GUARDRAILS_OWNER_CHANGE' "$cmd" &&
  block "GUARDRAILS_OWNER_CHANGE is the owner's switch to commit guardrail changes; the agent never sets it."

# --- AI signatures in commits, PRs and issues ---
if has '(git( +-[cC] +[^ ]+)* +(commit|tag)|gh +(pr|issue) +(create|edit|comment)|gh +api)' "$cmd" &&
   has '(co-authored-by|generated (with|by) \[?(claude|cursor|copilot|codex)|claude-session|noreply@anthropic|claude\.ai/code|claude\.com/claude-code|🤖)' "$cmd"; then
  block "commits, PRs and issues go without co-authors or AI tool signatures (see AGENTS.md)."
fi

# --- Owner-only actions ---
# gh accepts flags between its words (gh pr --repo o/r merge 1), so each gap may hold flags and their values.
gf='( +-[^ ]+( +[^ -][^ ]*)?)*'
has "(^|[ ;&|(])gh${gf} +(pr${gf} +merge|repo${gf} +(delete|archive|rename|transfer)|repo${gf} +edit.*(--visibility|--default-branch)|secret|variable|ssh-key|gpg-key|auth${gf} +(token|refresh|logout|login|switch)|release${gf} +(create|delete|edit|upload)|workflow${gf} +(run|enable|disable)|ruleset|pr${gf} +edit.*--base|config${gf} +get.*token)( |$)" "$cmd_code" &&
  block "merging PRs, repo settings, secrets, variables, keys, releases, workflow runs or the gh token: the owner does that."
# gh api: only reads and plain POSTs (comments, reviews). A method from a variable, or the endpoints that
# move code or change the repository's settings, are the owner's.
if has "(^|[ ;&|(])gh${gf} +api( |$)" "$cmd"; then
  # A review through the API may only comment (event=COMMENT), like gh pr review --comment.
  if has '/pulls/[^ /]+/reviews' "$cmd"; then
    has '/reviews/[^ /]+/(dismissals|events)' "$cmd" && ! has '(^| )-[a-zA-Z]*[fF] *event=COMMENT( |$)|--(raw-)?field[ =]event=COMMENT( |$)' "$cmd" &&
      block "gh api on a review's events or dismissals: only commenting (event=COMMENT) is the agent's."
    has '(^| )(-[a-zA-Z]*[fF]|--field|--raw-field|--input|-[a-zA-Z]*X|--method)' "$cmd" &&
      { has '(^| )--input( |=|$)|=@' "$cmd" || ! has '(^| )(-[a-zA-Z]*[fF] *|--(raw-)?field[ =])event=COMMENT( |$)' "$cmd" ||
        has 'event=(APPROVE|REQUEST_CHANGES)' "$cmd"; } &&
      block "gh api pull request reviews: only -f event=COMMENT (approving or requesting changes is the code owner's)."
  fi
  { has '(-[a-zA-Z]*X|--method)[ =]*[^ ]*\$|(-[a-zA-Z]*X|--method)[ =]*(DELETE|PUT|PATCH)' "$cmd_raw" ||
    has '(-[a-zA-Z]*X|--method)[ =]*(DELETE|PUT|PATCH)' "$cmd"; } &&
    block "gh api with DELETE/PUT/PATCH, or with the method in a variable: the owner does that."
  has '(^| )(-[a-zA-Z]*H|--header)[ =]*[^ ]*[Mm]ethod-[Oo]verride' "$cmd" && block "gh api with a method-override header: the owner does that."
  # gh api is a GET unless it sends fields or names a method.
  has '(^| )(-[a-zA-Z]*X|--method)[ =]*POST|(^| )(-[a-zA-Z]*[fF]|--field|--raw-field|--input)' "$cmd" &&
  has '/(merge[a-z_-]*|git/refs|git/ref|rulesets|protection|branches/[^ ]*/rename|collaborators|[a-z_]*keys|hooks|statuses|deployments|check-runs|check-suites|invitations|autolinks|interaction-limits|vulnerability-alerts|automated-security-fixes|actions/(secrets|variables|permissions|workflows/[^ ]*/dispatches)|environments|releases|pages|transfer|dispatches|forks)( |/|$|\?)|visibility|default_branch' "$cmd" &&
    block "gh api on an endpoint that merges, moves refs or changes the repository: the owner does that."
  # The query must be written inline: --input, -F query=@file or a substitution could carry a mutation.
  has 'graphql' "$cmd" && { has '(^| )--input( |=|$)|(^| )(-[a-zA-Z]*F *|--field[ =])[^ ]*=@' "$cmd" || has '[$`]' "$(printf '%s' "$cmd_raw" | sed -E "s/'[^']*'//g")"; } &&   # $var inside '…' is GraphQL's own
    block "gh api graphql takes its query written inline (no --input, -F …=@file or substitutions), so the guard can check it is not a mutation."
  has 'graphql' "$cmd" && has 'mutation' "$cmd" &&
    block "gh api graphql is for queries only: mutations are the owner's (use gh pr comment / gh issue comment to write)."
fi

# --- Destructive ---
has '(^|[ ;&|/])rm( +-[a-zA-Z-]+)+ +(-- +)?(/|~|\$HOME|\.\.?/?)( |$)' "$cmd" && has '( -[a-zA-Z]*r| --recursive)' "$cmd" &&
  block "dangerous recursive delete."
has 'git( +-[cC] +[^ ]+)* +(reset( +[^ ]+)* +--ha[a-z]*|clean( +[^ ]+)* +(-[a-zA-Z]*f[a-zA-Z]*|--f[a-z]*)|filter-(branch|repo)|update-ref +-d|reflog +expire)( |$)' "$cmd_code" &&
  block "command that destroys work or rewrites history. Ask the owner for confirmation."

# Recursive deletes outside the project (~/…, $HOME/…, /…; the temp folder is fine).
while IFS= read -r ln; do
  has '(^|[ ;&|(/])(rm|chmod|chown|chgrp)( |$)' "$ln" && has '( -[a-zA-Z]*[rR]| --recursive)' "$ln" || continue
  for t in $ln; do
    case "$t" in /tmp/?*|/private/tmp/?*|/var/folders/?*) ;;
      /*|~*|'$HOME'*|'${HOME}'*|..|../*|*/..|*/../*) block "recursive delete or permission change outside the project ('$t'): ask the owner." ;; esac
  done
done <<< "$cmd_code"
# git branch -D deletes a branch whether or not it was merged (case-sensitive: -d is fine).
printf '%s' "$cmd_code" | grep -Eq -- '(^|[ ;&|(])git +branch( +[^ ]+)* +(-[a-zA-Z]*D[a-zA-Z]*|--delete +--force|--force +--delete)( |$)' &&
  block "git branch -D deletes unmerged work: use git branch -d, or ask the owner."
# find from outside the project that deletes or changes permissions (find ~ -exec chmod …, find / -delete).
while IFS= read -r ln; do
  has '(^|[ ;&|(/])find( |$)' "$ln" && has '-(exec|execdir|ok|okdir) +([^ ]*/)?(rm|chmod|chown|chgrp)( |$)|-delete( |$)' "$ln" || continue
  for t in $ln; do
    [[ "$t" == -* ]] && break
    case "$t" in /tmp/?*|/private/tmp/?*|/var/folders/?*) ;; /*|~*|'$HOME'*|'${HOME}'*|..|../*|*/..|*/../*)
      block "find from outside the project ('$t') that deletes or changes permissions: ask the owner." ;; esac
  done
done <<< "$cmd_code"
# Discarding every uncommitted change at once (git checkout -- ., git restore .): ask the owner.
has '(^|[ ;&|(])git +(checkout( +-[^ ]+)* +-- +(\.|:/|\*)|restore( +--(worktree|source=[^ ]+|source +[^ ]+)|-W)* +(-- +)?(\.|:/|\*))( |$)' "$cmd_code" &&
  block "discarding every uncommitted change (git checkout -- . / git restore .) is the owner's call: name the files."
# Publishing packages and images is outward-facing: the owner does it.
has '(^|[ ;&|(])((npm|pnpm|yarn|bun)( +[^ ]+)* +publish|twine +upload|cargo( +[^ ]+)* +publish|gem +push|poetry +publish|uv +publish|(docker|podman)( +[^ ]+)* +(image +)?push)( |$)' "$cmd_code" &&
  block "publishing a package or image is the owner's."
has '(^|[ ;&|(])(shutdown|reboot|halt|poweroff)( |$)|(^|[ ;&|(])dd( .*)? of=/dev/' "$cmd_code" &&
  block "shutting the machine down or writing a raw device is not allowed."
# --- Running downloaded code ---
has '(curl|wget)[^|]*\|[[:space:]]*(sudo +)?(ba|z|da)?sh( |$)|(ba|z)?sh +<\( *(curl|wget)|(curl|wget).*\| *(python3?|node|perl|ruby)( |$)' "$(printf '%s' "$cmd_code" | sed -E 's/\| *python3? +-m +json\.tool//g')" &&
  block "scripts downloaded from the internet are not run."

# The commands that actually run: text-only commands (rg, grep, echo…) left out, messages already MSG, words joined.
cmd_exec=""; cmd_exec_w=""
for p in "${parts[@]+"${parts[@]}"}"; do
  read -r -a ws <<< "$p"; k=0
  while (( k < ${#ws[@]} )) && [[ "${ws[$k]}" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; do k=$((k + 1)); done
  (( k == 0 )) && [[ "$text_only" == *" ${ws[$k]:-} "* ]] && continue   # VAR=… rg is not text-only
  cmd_exec+="$(printf '%s' "$p" | tr '\037' ' ' | tr -d "\"'\\\\")"$'\n'
  cmd_exec_w+="$(printf '%s' "$p" | tr -d "\"'\\\\")"$'\n'   # words kept whole (\x1f inside a word)
done

# Code fed to a shell through a pipe, a heredoc or a here-string is not visible as a command: refused.
has '\|[[:space:]]*(sudo +)?([^ |]*/)?(sh|bash|zsh|dash|ksh|mksh|ash|yash|csh|tcsh|fish|pwsh|busybox)( +-[a-zA-Z]+)*[[:space:]]*($|[;&|)])' "$cmd_raw" &&
  block "piping commands into a shell hides them from the guard: run them directly."
has '(^|[ ;&|(/])(sh|bash|zsh|dash|ksh|mksh|ash|yash|csh|tcsh|fish|pwsh|busybox)( +-[a-zA-Z]+)* *<<' "$cmd_raw" &&
  block "feeding a shell a heredoc or here-string hides its commands from the guard: run them directly."

has '(^|[ ;&|(])(source|\.)[[:space:]]+(<\(|/dev/(stdin|fd)|-([[:space:]]|$)|[$`])' "${cmd_raw//$'\\\n'/}" &&
  block "source/. of a substitution, stdin or a variable runs code the guard can't see: source a file by name."
# jq (and gh --jq/-q) can print the whole environment: env, $ENV.
while IFS= read -r ln; do
  has '(^|[ ;&|(/])(jq|gojq|jaq)( |$)|(^| )gh( .*)? (--jq|-[a-zA-Z]*q)' "$ln" || continue
  has '(^|[^A-Za-z0-9_$.])env([^A-Za-z0-9_]|$)|\$ENV|\$__prog|(^| )-[a-zA-Z]*q *env([^A-Za-z0-9_]|$)' "$ln" &&
    block "jq's env / \$ENV print the whole environment: read one named value another way."
done <<< "$cmd_exec"
has '://[^ ]*/\.\.(/|[ "'"'"']|$)' "$cmd_raw" && block "a URL-looking word with /.. in it: write the path plainly."
# --- Secrets and credentials from the shell ---
# .env and .env.<anything> except .env.example; globs that could match .env (.en?, .e*v) too.
has '(^|[^a-zA-Z0-9_])\.env($|[^a-zA-Z.]|\.[A-Za-z0-9_-])' "$(printf '%s' "$cmd" | sed -E 's/(^|[ [(])(-[efrsdLhw]) +\.env([ );]|$)/\1\2 ENVTEST\3/g; s/\\\.env/ESCENV/g; s/\.env\.(example|sample|template|dist)([ "'"'"';|&)<>]|$)/EXAMPLE\2/g')" &&
  block "access to credential files from the shell."
[[ " ${parts[*]+"${parts[*]}"} " == *" GUARD_ENV_GLOB "* ]] && block "a file pattern that could match .env: name the file instead."
has '\.ssh/|id_rsa|id_ed25519|\.aws/|\.netrc|\.npmrc|\.kube/|\.docker/config|\.gnupg|\.config/(gh|gcloud|op|hub|doctl|glab-cli)|\.pypirc|\.pgpass|\.cargo/credentials|\.vault-token|\.azure/|\.gem/credentials|\.s3cfg|\.boto([^A-Za-z]|$)|\.[a-z]*_history|\.config/(git/credentials|rclone)|\.terraform\.d/credentials|\.composer/auth|\.yarnrc|\.oci/|\.vercel/|\.npm/_auth|\.m2/settings|/proc/[^ ]*/environ|security +find-' "$cmd" &&
  block "access to credential files from the shell."
has '(^|[ ;&|])(launchctl +getenv)|gh +auth +status.*(-t|--show-token)|git +credential|\.git-credentials|\.environ($|[^.\[A-Za-z_]|\.(copy|items|keys|values))|dict\(os\.environ|process\.env($|[^.\[A-Za-z_])|process\[env\]|ENV\.(to_h|each|keys|inspect|to_a)|(^|[ ;(])(p|pp|puts|print) +ENV($|[^]A-Za-z_.=[])|getenv\(\)|Environment(\.|\]?::)GetEnvironmentVariables|Bun\.env|Deno\.env|phpinfo' "$cmd_exec" &&
  block "dump of environment variables from an interpreter."
# A secret read by name from an interpreter (os.environ["GH_TOKEN"], process.env.GH_TOKEN, getenv("…_SECRET")…).
has '(environ|getenv|process\.env|process\[env\]|(^|[^A-Za-z])ENV([^A-Za-z]|$)|Env::var|Getenv|GetEnvironmentVariable|\$env:)' "$cmd_exec" &&
  printf '%s' "$cmd_exec" | grep -Eq '[A-Z0-9_]*(TOKEN|SECRET|PASSW|API_?KEY|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*' &&
  block "reading a secret from the environment (a variable named like a token, secret, password or key) is not allowed."
# Interpreter one-liners that run git (subprocess.run(["git", …]), execSync("git …")): run git directly instead.
interp_re='(^|[ ;&|(/])(python[0-9.]*|node|perl|ruby|php|deno|bun|osascript|lua|Rscript|g?awk|mawk|nawk)( .*)? (-[a-zA-Z]*[ceEr]|--eval|--exec|-p|BEGIN|\{)'
has "$interp_re" "$cmd_exec" &&
  has '(subprocess|os\.system|popen|spawn|exec|system|`|%x|Command|ProcessBuilder|run|shell script|open|Open3|capture|passthru|shell_exec|proc_open)' "$cmd_exec" &&
  has '(^|[^A-Za-z0-9_.-])git([^A-Za-z0-9_-]|$)' "$(printf '%s' "$cmd_exec_w" | sed -E 's/(^|[ ;&|(])git( |$)/\1GITCMD\2/g')" &&
  block "running git from an interpreter one-liner is not allowed: run git directly, so the guard checks it."
# In an interpreter one-liner, the environment may only be read one named variable at a time
# (os.environ["HOME"], os.getenv("HOME"), process.env.HOME, ENV["HOME"], ENV.fetch("HOME"), $ENV{HOME}):
# any other mention (ENV.entries, getenv( ), os.environ.__repr__()…) can print all of it.
while IFS= read -r ln; do
  has "$interp_re" "$ln" || continue
  has '(system|exec|popen|spawn|execSync|execFile|shell script|passthru|shell_exec|proc_open|Command|run)' "$ln" &&
    has '(^|[^A-Za-z0-9_.-])(env|printenv)([]" '"'"'`),;]|$)' "$ln" &&
    block "an interpreter one-liner that runs env/printenv prints the whole environment."
  has '(^|[^A-Za-z0-9_])(vars|getattr|globals|locals|__import__|eval|exec|compile)\(|__dict__|__getattribute__|import_module|importlib\.(util|__import__)|Reflect\.|globalThis\[|process\[|const_get|instance_variable_get|\.send\(|__send__|\$GLOBALS|(set|del)attr\(|attrgetter|methodcaller|__getattr__|sys\.modules|__builtins__|__class__|__subclasses__|__mro__|__globals__|__reduce|(^|[^A-Za-z0-9_])(posix|nt|_os)\.|Object\.[A-Za-z]+\( *(process|globalThis)|instance_variables|public_send|::(send|method)\(|method\(:|\[::-1\]' "$ln" &&
    block "interpreter one-liners can't build names at run time (vars(), getattr, eval, process[…], symbolic refs…): write the code in a file or name things literally."
  # Perl symbolic references (%{"EN"."V"}, ${"main::ENV"}): the scanner has already removed the quotes.
  has '(^|[ ;&|(/])perl[0-9.]*( |$)' "$ln" && has '[%@$]\{ *[^ ${}[]' "$ln" &&
    block "perl one-liners can't use symbolic references (%{\"NAME\"}): name the variable literally."
  envrest="$(printf '%s' "$ln" | sed -E 's/environ\[ *[A-Za-z_][A-Za-z0-9_]* *]//g; s/environ\.get\( *[A-Za-z_][A-Za-z0-9_]* *[,)]//g; s/getenv\( *[A-Za-z_][A-Za-z0-9_]* *[,)]//g; s/process\.env(\.[A-Za-z_][A-Za-z0-9_]*|\[ *[A-Za-z_][A-Za-z0-9_]* *])//g; s/ENV(\[ *[A-Za-z_][A-Za-z0-9_]* *]|\.fetch\( *[A-Za-z_][A-Za-z0-9_]* *[,)])//g; s/\$ENV\{[A-Za-z_][A-Za-z0-9_]*\}//g')"
  printf '%s' "$envrest" | grep -Eq '(^|[^A-Za-z_])environ([^A-Za-z_]|$)|getenv|process\.env|process\[env\]|(^|[^A-Za-z_])ENV([^A-Za-z_]|$)|\$_(ENV|SERVER)|Env::var|Getenv|GetEnvironmentVariable' &&
    block "an interpreter one-liner may read one named environment variable (os.environ[\"HOME\"]), not the environment as a whole."
done <<< "$cmd_exec"
# Case-sensitive: awk's ENVIRON and Perl's %ENV (os.environ["HOME"] stays allowed).
# A bare "environ" not written as os.environ (vars(os)["environ"], getattr(os, "environ")) is reflection.
printf '%s' "$cmd_exec" | grep -Eq '(^|[^A-Za-z_])ENVIRON([^A-Za-z_]|$)|%ENV([^A-Za-z_]|$)|(^|[^.A-Za-z_])environ([^A-Za-z_]|$)|__dict__|getattr\( *os' &&
  block "dump of environment variables from an interpreter."

exit 0
