# Changelog

All notable changes to Snowlog. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Security
- **bsketch's drawing engine after its pre-2.0 audits** (serbenda/bsketch `0a573ca`). A hostile drawing in a vault can
  no longer use up the page's memory or freeze it: hachure and elbow routing have a budget per drawing, presentations
  and PDFs are capped at 500 slides, libraries share their pictures, and text to diagram parses in linear time.
  Texts with control characters no longer break an exported SVG.

### Added
- From the same engine: speaker notes per frame (N while presenting) and a timer; elbow arrows that go around the
  shapes in their way; templates in Catalan, French and Portuguese.

### Fixed
- **Two devices saving in the same millisecond no longer overwrite each other.** A note's or drawing's version was
  only its date, so two saves that landed in the same millisecond looked like the same version and the second one
  silently replaced the first. Each save now also records a random `rev`; versions written before keep working.

### Added
- **The drawing library** (Shift+L in a drawing): pieces kept to reuse in any drawing, shared between devices. In a
  GitHub vault it is one more encrypted file (`.snowlog/library.enc`, encrypted again when the key is rotated); in a
  folder, a plain `.snowlog/library.bsketchlib`.
- **Drawing templates** in the command palette ("New drawing from a template: …"): flowchart, decision,
  architecture, mind map and org chart.

### Changed
- **Drawings get bsketch 1.3's engine:** frames clip what lies on them, a presentation mode (Shift+P) shows the frames
  one by one with a laser pointer, and arrows bend by dragging their middle.
- **Drawings get bsketch's latest engine:** pictures (insert, paste or drop), frames, text to diagram without AI
  (paste an indented list, a Mermaid flowchart or `A -> B` lines on a drawing), Ctrl+arrow keys to chain the next
  shape, animated flow arrows, and copy and paste of drawings' pieces between tabs.
- **Drawings use the latest bsketch engine** (the project was renamed from sketch to
  [bsketch](https://github.com/serbenda/bsketch)): elbow and curved arrows and lines, arrowheads at either end, three
  fonts for text (hand, normal, code), and the grid when resizing and rotating.

### Added
- **MCP server and script access** (`agent/`, see `docs/AGENT_ACCESS.md`): list, read, search, follow links and backlinks, create notes (also from a template), append at the end or to a section, and the daily note, encrypting and decrypting locally with the same modules as the site. It works on a clone of the notes repository: each change is a commit pushed with git, and if the app wrote first it is merged as between two devices. The passphrase is asked for in a system dialog and never reaches the client; the key only lives in memory and is forgotten after 10 minutes unused. `agent/test-vault.mjs` creates a test vault.
- **Desktop version with Tauri** for Windows (an `.exe` that opens without installing), macOS (an `.app` for Intel and Apple Silicon) and Linux (AppImage): a window of its own with the site inside, no browser. The "Desktop" workflow builds it and leaves it as an artifact. Unsigned: on company computers the antivirus may block it; for those cases the portable HTML version remains.
- **Drawings changed on two devices are merged** element by element: if one moves a box and the other adds a diamond, both stay without creating copies. Only if both change the same element differently is the other version also kept apart. This also applies to a folder on the computer (changes made outside).
- **Search finds drawings** by their name and by the texts inside them, and when a drawing is open, "Backlinks" shows the notes that embed it.
- Drawings with the keyboard (create, go through, move, resize and rotate without a mouse) and smoother with many elements (sketch engine updated).
- Drawings: handwriting, text inside shapes (double click), arrows attached to shapes, rotate, group, align and distribute (sketch engine updated). In the portable version texts use the system cursive, because its CSP allows no fonts.
- **Hand-drawn drawings** (engine from [sketch](https://github.com/serbenda/sketch)): "New drawing" creates a `.sketch` in the drawings folder and opens it on a whiteboard with rectangles, diamonds, ellipses, arrows, lines, pencil, text and eraser; undo, zoom and light and dark themes. "Insert a new drawing" adds `![[Drawing….sketch]]` to the note, shown as an image in reading mode and opened when clicked. They are stored encrypted like any attachment. Attaching an `.excalidraw` converts it to `.sketch`. `scripts/update-sketch.mjs` copies the engine from the sketch repository.
- **Change the encryption key** ("Passphrase and recovery…" → "Change the encryption key"): every note, attachment and the index are encrypted again with a new key in a single commit, and a new recovery code is generated. Earlier keys are kept encrypted with the new one in a keyring, so the history is still readable. Other devices ask for the passphrase when saving or entering, and what they were writing is not lost: it is uploaded after unlocking.
- If the passphrase is changed on another device, this one asks for the new one when unlocking (before, the old one still worked here).
- **Automatic merging:** if the same note changes on two devices (or outside Snowlog, in the portable version) in different parts, both changes are combined without copies. If both add lines at the same place, both stay. Only when the same lines change differently is the other version kept as a copy, as before.
- Much faster first entry on a new device: notes are downloaded in blocks of 100 (GitHub GraphQL) instead of one by one. With 1,000 notes and 150 ms of latency, the full index goes from 17.5 s to 2.9 s. If GraphQL is unavailable, it works as before.
- **Browser tests** (`npm run test:e2e`, and in CI on every push and PR): create a vault, write, lock and enter again with nothing in plaintext in the repository; a note's HTML does not run and the CSP does not complain; examples, search and renaming with links; and the portable version from disk with no connection at all. They drive Chrome directly over the DevTools protocol, with no dependencies.
- **Moving notes between the portable and the online version:** "Import a backup (.snowlog or .zip)…" accepts the online encrypted backup and the portable `.zip` (or "Export unencrypted"). It can import into a separate folder or as is, with folders and attachments.
- Portable version on Firefox and Safari (and any browser that cannot pick folders): "Store inside the browser" keeps the notes in IndexedDB (or localStorage if there is none) and they are still there when the file is opened again.
- Folders on the computer: Snowlog detects what changes from outside (another editor, OneDrive, Dropbox…) when coming back to the window and every 10 s. It updates the tree and the open note; if the open note is deleted outside while typing, what was written is saved in "Recovered".
- **Kanban boards** on plain Markdown (`## Column` and `- [ ] card`, with `kanban-plugin: basic` or `kanban: true` in the properties): drag cards between columns; add, edit, tick and delete cards; and create, rename, move and delete columns. "New Kanban board" in the menu and the palette. The text stays editable with Ctrl+E.
- **Graph view** (Ctrl+G or the ribbon button): notes and links with a force-directed layout, zoom, drag, neighbors highlighted on hover and a note opened on click. "Graph of this note" shows only the note and its neighbors (1 to 3 hops); notes without links can be hidden.
- **Command palette** (Ctrl+P or the `>_` button): every action by name, ignoring accents and case, with the most recent first. Ctrl+O still opens notes.
- **Bookmarks:** "Add to bookmarks" in the note or tree menu, and a Bookmarks tab in the left panel. They follow the note on rename or move and are shared between devices (they go in the encrypted settings).
- **Preview** of a note when hovering over a `[[link]]` in reading mode.
- **Settings** inside the app (gear button or ⋯ menu): dashboard, daily folder and template, open today's note on start, templates and attachments folders, minutes until lock, days between backup reminders, and theme (automatic, light or dark). Online they are stored encrypted in the vault and apply on every device; locally, in a JSON file inside the folder. `config.js` stays as the defaults.
- A security document: what Snowlog protects and from whom, what stays on the device, the CSP, the review's findings and the accepted risks (now `docs/THREAT_MODEL.md`).
- The online version works offline: the site is stored in the browser (service worker) and opens without a network; notes already downloaded can be read and edited, and new ones created. What is written stays encrypted on this device and is uploaded when the network is back, with the usual conflict detection. The status bar says so: "Offline · 2 changes to upload". Renaming, deleting, moving or attaching while offline says a network is needed (except renaming a note created offline).
- It can be installed as an app from the browser (web manifest).
- An encrypted local cache (IndexedDB) of the online version's notes and attachments: only what changed is downloaded. With 1,000 notes, entering takes under half a second and search is ready in under 1 s; on a new device, the first time everything is downloaded in the background (10 at a time) while you can already work. "Sign out" and "Forget this device" delete it.
- Search says how many notes match even when it only shows the first 200, and how many it has decrypted while it prepares the index.
- Backups: "Encrypted backup" downloads a `.snowlog` file with every note and attachment encrypted, which opens with the passphrase or the recovery code, without GitHub. Importing it brings it into a separate folder or downloads it as an unencrypted `.zip`; it also works in the portable version, offline. Locally, the backup is the usual `.zip`.
- A reminder when 7 days pass without a backup (`backupReminderDays` in the configuration), with "Back up now" or "Tomorrow".
- Locking also clears the notices on screen.
- "Passphrase and recovery…" in the ⋯ menu: change the passphrase (asks for the current one) and generate a new recovery code (the previous one stops working). Only the key is re-wrapped; notes are not re-encrypted. Changing it applies the configured PBKDF2 iterations if they are more.
- Version history of each note (menu ⋯ › "Version history…"): a list of versions with dates, a preview, how many lines differ from the current one, and a button to restore (restoring deletes nothing from the history). Online they are read, encrypted, from the repository's commits; locally a copy is kept in `.history/` at most every 10 minutes (the last 50 per note).
- No change is lost between devices: if the same note changed elsewhere since you opened it, saving keeps your version and the other goes to a copy "Note (other device YYYY-MM-DD HHMM)", with a notice that opens it. If it was deleted on another device, saving it restores it. In the portable version the same happens when the folder is synced (OneDrive, Dropbox…) and the file changed outside.
- Attachments: paste or drop images and PDFs into the editor (or "Attach an image or PDF…" in the menu). They are saved in the attachments folder and inserted as `![[name]]`; in reading mode the image shows (`![[photo.png|300]]` sets the width) or a PDF card to open it. Online they are encrypted (`a/<id>.enc`); in the portable version they are normal files. At most 20 MB per attachment.
- Attachments appear in the tree (open, insert into the note, delete), move with their folder and go into the `.zip` backup.
- Search across all notes (Ctrl+Shift+F): ignoring accents and case, with each match's snippet highlighted; supports `"phrase"`, `-word`, `tag:#tag` and `path:folder`. Clicking a result opens the note with the text selected.
- A tags panel with the number of notes for each; clicking a tag searches its notes.
- A left panel with tabs: Files, Search and Tags.
- Editor: Markdown highlighting while typing (color only, the text does not move); Enter continues lists, tasks and quotes, and on an empty item leaves the list; Tab and Shift+Tab indent.
- Editor: typing `[[` suggests notes; if the note does not exist, it can be created from there.
- Shortcuts: Ctrl+B (bold), Ctrl+I (italic), Ctrl+K (link) and Ctrl+Enter (tick or create a task), with normal undo.
- Renaming or moving a note or folder updates the `[[links]]` that point to it in every note (a single commit online).
- Reading mode: the frontmatter shows as properties (with tags, lists and checkboxes).
- Markdown tables with alignment, empty cells and escaped `\|`.
- Callouts (`> [!info]`, `[!warning]`, `[!danger]`…) with colors, aliases and a foldable version (`+`/`-`).
- `#tag` tags in the text and in tasks.
- Project instructions for Claude, a context document, a Definition of Done and commands in `.claude/commands/`.
- A CI check of commit authorship.
- Sign-in with GitHub enabled: the GitHub App's client ID and the Worker URL in the configuration.
- Daily note: a **Today** button (Ctrl+D); it opens by itself on entry and is created from the daily template.
- Templates with `{{title}}`, `{{date:FORMAT}}` and `{{time}}`: "Insert template" and "New note from template".
- Dataview-style queries in ```` ```dataview ```` blocks: `TASK`, `LIST` and `TABLE` with `FROM`, `WHERE`, `GROUP BY`, `SORT` and `LIMIT`.
- Tasks ticked with a click in reading mode and from a query's results; the change is saved in its note.
- A right panel with a monthly calendar (dots on the days with a note) and backlinks.
- A dashboard with `cssclasses: dashboard`: top-level lists show as columns.
- "Set up my space": creates the dashboard, the daily folder, projects, templates (daily note, note, project, meeting, knowledge pill and procedure) and an archive.
- Import a folder of Markdown (for example, an existing vault): it is encrypted in the browser and uploaded in batches.
- **Portable version** `snowlog-portable.html`: a single file that opens with a double click in Chrome or Edge, with nothing to install and no internet. Notes are `.md` files in a folder on the computer; the CSP forbids any connection.
- Local mode in the online version too: "Use notes on this computer, without GitHub".
- Export a copy (`.zip`) of every note, in both versions.
- What is deleted in local mode goes to `.trash` inside the folder.
- GitHub Actions builds the portable version and publishes it at `https://snowlog.bendi.dev/snowlog-portable.html`.
- "Load examples": an example project (Recipe website) with 4 stories, a board, a meeting, a knowledge pill and linked daily notes, to see how to organize.

### Changed
- Security: the CSP only allows connecting to GitHub and the configured Worker (before, any `*.workers.dev`); Trusted Types are required for all rendered HTML; Snowlog does not start inside an iframe; locking also clears the tab title, the breadcrumbs and open dialogs; open folders are remembered encrypted.
- Grouped saves: online, a save happens after 4 s without typing (before 2.5 s) and at most every 30 s while typing non-stop, so there are fewer commits and nothing is lost; switching tab or app saves at once. Locally, 1 s.
- Snowlog is published at `https://snowlog.bendi.dev`; the Worker only accepts that origin.
- In done tasks only the text is struck through, not the checkbox or the space.
- The outline and the word count ignore the frontmatter.
- Lists nest by the real indentation (2 or 4 spaces, or tabs).
- Links and tags written inside `code` no longer count as links or tags.

### Fixed
- The ⋯ menu opens below its button without covering it (before, with the menu open it could not be clicked again).
- Boards on a phone: one column per screen, with scrolling that snaps to each column.
- The ⋯ menu no longer goes off screen (it has its own scrolling) and closes when a keyboard shortcut is used.
- With many notes, the tree no longer stretches the whole page: each panel scrolls on its own.
- The sign-in screen no longer shows the text "null" when sign-in with GitHub is enabled.

## [0.1.0] - 2026-11-09

### Added
- End-to-end encryption with WebCrypto: a data key wrapped with the passphrase and a recovery code.
- A vault in a private GitHub repository: an encrypted index and one encrypted note per file, with a random name.
- One atomic commit per save, with a retry on simultaneous writes.
- Sign-in with a personal token or with GitHub (GitHub App and Cloudflare Worker), with automatic refresh.
- An interface with a ribbon, a tree with folders, an editor, reading mode, a quick switcher, an outline and a status bar.
- Automatic lock after 10 minutes of inactivity.
- Tests with `node --test`, publishing to GitHub Pages with GitHub Actions, and a setup guide.
