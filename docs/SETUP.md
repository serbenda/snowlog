# Local environment

> How to run and verify the project. Claude reads it to know how to run and check its work.
> Publishing the site and setting up the sign-in are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Requirements
- git and python3 (for the security hook and a local web server)
- Node.js 22 or newer (the tests use `node --test`; the e2e walkthroughs use the global `WebSocket`)
- Google Chrome or Chromium, for the e2e walkthroughs (set `CHROME_BIN` if it is not in `/usr/bin`)
- [Gitleaks](https://github.com/gitleaks/gitleaks) 8.x: the git hooks refuse every commit without it
- Only for the sign-in Worker: a Cloudflare account and `npx wrangler` (see DEPLOYMENT)
- Only for the desktop app: Rust (rustup) and the Tauri prerequisites of your system; CI builds it anyway

## First time
```bash
git clone https://github.com/serbenda/snowlog.git
cd snowlog
git switch development
git config core.hooksPath .githooks
```

## Daily use
| To | Command |
|---|---|
| Run locally | `python3 -m http.server 8000 -d public`, then open http://localhost:8000 |
| Run the unit tests | `npm test` |
| Run the browser walkthroughs | `npm run test:e2e` |
| Build the portable file | `npm run build:portable` (writes `dist/snowlog-portable.html`) |
| Copy the drawing engine from sketch | `node scripts/update-sketch.mjs ../sketch` |
| Create a TEST vault for the MCP server | `node agent/test-vault.mjs /path/to/new/folder` |
| Run the MCP server | `node agent/mcp.js --dir <clone of the notes repository>` (see [AGENT_ACCESS.md](AGENT_ACCESS.md)) |
| Build the desktop app | `cd desktop && npx @tauri-apps/cli@2.12.4 icon icon.png && node ../scripts/build-portable.mjs app/index.html && npx @tauri-apps/cli@2.12.4 build` |

The local server is also defined in `.claude/launch.json` for the Claude Code preview. Never point the MCP
server at the real notes unless the owner asks; the passphrase is always typed by the owner in the system dialog.

## Verify
Same as CI's Hook and Tests jobs. Must pass before anything is considered done:
```bash
shellcheck --severity=error scripts/*.sh .claude/hooks/*.sh .githooks/*
bash scripts/test-guard.sh           # the Claude guard hook
bash scripts/test-check-records.sh   # the worklog and STATE check
bash scripts/test-githooks.sh        # the git hooks (needs gitleaks)
npm test                             # encryption, vault, Markdown, queries, agent access…
npm run test:e2e                     # sign-in, safe reading, examples, portable file, key rotation, in Chrome
```

## Stack checklist
- [x] **Requirements, Daily use and Verify** in this file filled in with real commands, and `Verify` passes locally.
- [x] **`.claude/launch.json`** defines the local server.
- [x] **CI job** "Tests" in `.github/workflows/ci.yml` runs the unit tests and the e2e walkthroughs, with actions pinned to a full commit SHA and `permissions: contents: read`.
- [x] **Dependabot**: `github-actions`, the scanner images, the dev container and `cargo` (desktop app). No npm entry: there are no npm dependencies.
- [x] **Static analysis**: Semgrep (SAST job). CodeQL is not added for now (optional; it would be one more workflow).
- [x] **`.gitignore`** extended with the Worker's local files and the desktop build output.
- [x] **Environment variables**: see below.
- [x] **Definition of Done**: the API/backend and CLI blocks replaced by Snowlog's own.
- [ ] **Owner:** add the new checks (Secrets, Authorship, Hook, Hook (macOS bash 3.2), SAST, Dependencies, Records, Tests) to the required checks of the "Protect main" ruleset, by running `./scripts/setup-repo.sh` or in GitHub → Settings → Rules.

## Environment variables
The web app has none: its public configuration is in `public/js/config.js` (nothing secret).

| Variable | Where | What for |
|---|---|---|
| `GITHUB_CLIENT_SECRET` | Cloudflare Worker secret (`npx wrangler secret put`) | The GitHub App's client secret; never in the repository |
| `ALLOWED_ORIGIN`, `GITHUB_CLIENT_ID` | `worker/wrangler.toml` (`[vars]`) | The site's origin and the GitHub App's client ID (not secret) |
| `CHROME_BIN` | Your shell, optional | Path to Chrome for `npm run test:e2e` |
| `SNOWLOG_VAULT_DIR` | Your shell, optional | The clone the MCP server works on, instead of `--dir` |
| `SNOWLOG_ASKPASS` | Your shell, optional | A program that prints the passphrase, instead of the macOS dialog (tests, other systems) |
