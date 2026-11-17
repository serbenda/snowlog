# Agent and script access (MCP server)

`agent/` lets an assistant with MCP, or a script, work with the vault as with a folder of Markdown: list, read,
search, follow links and backlinks, create, append and the daily note. Encryption happens locally with the same
modules as the site (`crypto.js`, `vault.js`, `noteindex.js`, `search.js`, `templates.js`, `merge.js`). Nothing
from the vault reaches the repository in plaintext.

## How it works

```
MCP client ──stdio (JSON-RPC)──▶ agent/mcp.js ──▶ Vault (public/js/vault.js)
                                                    └▶ GitDirRepo (agent/gitdir.js) ──git──▶ clone ──push──▶ GitHub
```

- **`GitDirRepo`** has the same interface as `GitHubRepo`, but over a local clone of the notes repository. It reads
  the encrypted files from `origin/main` after a `git fetch`, never from the working tree. It writes each change as a
  commit made with plumbing (a temporary index, `commit-tree`) and pushes it with `git push <sha>:main`.
  - If the push is rejected because the app wrote first, it throws the same 409 as the GitHub API. `Vault` reloads
    the index and repeats, and if the note changed in both places it merges it as between two devices.
  - If the clone is clean and on `main`, it moves it forward (`merge --ff-only`). Otherwise it leaves it alone.
- **`Session`** keeps the DEK only in memory and forgets it on lock: with the `lock` tool, after
  `lockAfterMinutes` unused (10 by default, as in the app) or when the process ends. It reads the index again if
  more than 10 s have passed since the last time, to see what the app changed.
- **Commit messages**: the same as the app (`Snowlog: new note`, `Snowlog: save note`), with no titles or paths. The
  author is the clone's `git config`.

## The passphrase

It never goes through the MCP client. The first tool that needs the key (or `unlock`) opens a macOS dialog with
hidden input (`osascript … with hidden answer`). The passphrase reaches this process through a pipe, the DEK is
derived and the passphrase is discarded. It is never in arguments, environment variables, files or errors, and no
tool returns it. After three failed attempts, or if cancelled, the tool returns an error.

`SNOWLOG_ASKPASS=/path/program` swaps the dialog for a program whose output is the passphrase, like
`SSH_ASKPASS`. It serves other systems and the tests.

**Careful:** what the server returns (decrypted note text) reaches the MCP client. While it is unlocked, whoever
uses the server can read the whole vault ([R-007](RISKS.md)).

## Tools

| Tool | What it does |
| --- | --- |
| `vault_status` | Whether it is unlocked, the number of notes, and the daily and templates folders. Does not ask for the passphrase |
| `unlock` / `lock` | Unlock with the dialog / forget the key and the decrypted notes |
| `list_notes` | Notes and folders, of the whole vault or of a folder (`recursive`) |
| `read_note` | A note's text; accepts `Folder/Note`, `Note`, `Note.md` or `[[Note]]` |
| `search` | The app's search: words, `"phrase"`, `-exclude`, `tag:#x`, `path:Folder` |
| `list_tags` | Tags with their number of notes |
| `links` | Outgoing links, with the target note or `null` if it does not exist |
| `backlinks` | Backlinks, with the lines where they appear |
| `create_note` | A new note, optionally from a template in the templates folder |
| `write_note` | Replaces the whole text (merges if it changed elsewhere) |
| `append_note` | Appends at the end, or at the end of a section (`heading`) |
| `daily_note` | Today's daily note or a given date's; creates it with the daily template |

## Usage

```bash
# A TEST vault (bare repository + clone, with the starter space and the example project)
node agent/test-vault.mjs /path/to/new/folder

# MCP server over a clone of the notes repository
node agent/mcp.js --dir ~/path/to/the/snowlog-notes/clone
```

Options: `--remote origin` and `--branch main` (the defaults), or `SNOWLOG_VAULT_DIR` instead of `--dir`.

From Claude Code (never against the real notes unless the owner asks):
`claude mcp add snowlog -- node <repo>/agent/mcp.js --dir <clone of the notes repository>`. The passphrase is
always typed by the owner in the system dialog; it is never asked for or passed through the chat, arguments or
environment.

## Tests

`tests/agent.test.mjs` creates a vault in a temporary folder (a bare remote and clones acting as devices) and
checks:

- unlocking, retrying and cancelling;
- reading, links and backlinks, search, appending by section and the daily note;
- that the app reads what the agent writes, and the other way round;
- merging simultaneous changes and a rejected push (409);
- that the repository holds nothing in plaintext;
- locking after inactivity;
- the MCP protocol, also as a process, and that the passphrase appears in no output.

## Next (phase 2)

Editing by heading or frontmatter property, moving with link rewriting, deleting to `Archive/`, ticking tasks,
`dataview` queries, links without a target and orphan notes, recent changes, a CLI, and vault rules in an encrypted
note.
