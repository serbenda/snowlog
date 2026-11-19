# Snowlog

> A personal Markdown notebook, **end-to-end encrypted**, that lives in a private GitHub repository. No server of
> its own: GitHub only ever sees ciphertext.

🔗 **Web:** https://snowlog.bendi.dev/

## What it does
- Notes and folders in Markdown, with `[[links]]`, backlinks, tags, frontmatter properties, tables, callouts and
  tasks; a reading mode and an editor with highlighting, list continuation and `[[` autocomplete.
- **Day to day:** a daily note (Ctrl+D) from a template, a dashboard note, Dataview-style queries
  (`TASK`, `LIST`, `TABLE`), a calendar, Kanban boards, a graph view and hand-drawn drawings
  (engine from [bsketch](https://github.com/serbenda/bsketch)).
- **Encrypted in the browser** with AES-256-GCM. The key comes from your passphrase and never leaves the device; a
  recovery code can set a new passphrase. File names in the repository are random and reveal no titles.
- Every save is a commit: full history with a restore button, and copies for free. Changes made on two devices are
  merged line by line; only clashing lines keep a copy.
- Works offline once opened (installable app), with encrypted backups (`.snowlog`) and import of a Markdown folder.
- Search across all notes, a command palette (Ctrl+P), bookmarks, link previews and settings inside the app.

## Three ways to use it
- **Online** at <https://snowlog.bendi.dev>: notes encrypted in a private GitHub repository, from any device.
- **Portable:** a single `snowlog-portable.html` that opens with a double click, with nothing to install and no
  internet; notes are `.md` files in a folder on your computer (or inside the browser on Firefox and Safari). See
  [docs/PORTABLE.md](docs/PORTABLE.md).
- **Desktop** (Tauri): a window of its own for Windows, macOS and Linux, built by the "Desktop" workflow as
  unsigned artifacts.

Scripts and AI assistants can work with the vault through an MCP server: [docs/AGENT_ACCESS.md](docs/AGENT_ACCESS.md).

## Shortcuts

| Key | Action |
| --- | --- |
| Ctrl/Cmd + N | New note |
| Ctrl/Cmd + O | Quick switcher: open or create a note |
| Ctrl/Cmd + P | Command palette |
| Ctrl/Cmd + E | Switch between editing and reading |
| Ctrl/Cmd + S | Save now |
| Ctrl/Cmd + D | Today's note |
| Ctrl/Cmd + G | Graph view |
| Ctrl/Cmd + Shift + F | Search all notes |
| F2 (in the tree) | Rename |

Also: right click in the tree, drag notes into folders, and `[[Another note]]` links that open or create notes.

A query, for example:

````markdown
```dataview
TASK
WHERE contains(text, "#commitment") AND !completed
GROUP BY file.link
```
````

## Data sources
| Source | What it provides | License |
|---|---|---|
| GitHub API (your private repository) | Storage, history and sync of your encrypted notes | GitHub terms |
| [Caveat](https://github.com/googlefonts/caveat) | The handwriting font in drawings, served from the site | SIL Open Font License ([public/fonts/OFL.txt](public/fonts/OFL.txt)) |

## Running locally
```bash
git clone https://github.com/serbenda/snowlog.git
cd snowlog
git switch development
```
How to start and verify it: [docs/SETUP.md](docs/SETUP.md). Publishing the site and setting up the sign-in:
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Structure
```
.
├── public/            # the site, served as is from GitHub Pages (HTML, CSS, ES modules, service worker)
│   └── js/            # crypto, github, vault, localvault, markdown, query, editor, app… (see docs/ARCHITECTURE.md)
├── agent/             # MCP server and script access over a clone of the notes repository
├── worker/            # Cloudflare Worker for the GitHub sign-in (holds the client secret)
├── desktop/           # desktop version (Tauri): icon, smoke test and src-tauri/
├── scripts/           # build-portable.mjs, update-sketch.mjs, and the template's setup, sync and check scripts
├── tests/             # node --test with a fake GitHub; tests/e2e: walkthroughs in Chrome over DevTools
├── docs/              # VISION, STATE, WORKLOG, ROADMAP, phases, decisions, ARCHITECTURE, THREAT_MODEL…
├── .claude/ · .githooks/ · .github/
├── AGENTS.md          # rules for any AI agent
└── CLAUDE.md          # imports AGENTS.md and adds what is specific to Claude Code
```

The notes repository only holds:

```
.snowlog/vault.json    encryption parameters and the wrapped data key (nothing readable)
.snowlog/index.enc     the encrypted index (titles, folders, dates, settings)
.snowlog/keyring.enc   earlier keys after a rotation, encrypted with the current one
n/<id>.enc             one encrypted note per file, with a random name
a/<id>.enc             one encrypted attachment per file
```

## How to work with Claude
Every flow, as diagrams: [docs/WORKFLOWS.md](docs/WORKFLOWS.md).

```
/status                      at the start of every session
/new-phase <what>            phase file + plan → you approve → Claude implements on development
(automatic)                  record-changes skill: WORKLOG after every change
/close-phase                 criteria + DoD + updates STATE, ROADMAP and CHANGELOG (once per phase)
/prepare-pr                  reviewers + development → main PR (you merge it)
/decision <what>             when something hard to undo has to be chosen
```

## Contributing
Read [AGENTS.md](AGENTS.md) and the [Definition of Done](docs/DEFINITION_OF_DONE.md).

## License
No license: © Sergio Santiago Bendaña Quesada. All rights reserved.
The code may be viewed, but not copied, modified or redistributed without the author's written permission.
