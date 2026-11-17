# Snowlog vision

> The filter for deciding what goes in and what doesn't: Claude reads it before proposing features.

## The problem
Personal notes (work logs, meetings, projects, ideas) end up either in a cloud notes service that can read them,
or in a local app whose sync and backups depend on another paid service. Moving between computers, including
locked-down company ones, makes it worse.

## Who it is for
The owner first: someone who keeps a daily note, meetings, projects and knowledge "pills" in Markdown with
links, tags and task queries, on his own computers, his phone and company computers. Then anyone who wants the
same with their own private GitHub repository.

## The idea
A Markdown notebook that runs entirely in the browser and stores every note **end-to-end encrypted** in a private
GitHub repository: GitHub keeps the history and the copies, but only ever sees ciphertext. The same app also runs
as a single portable HTML file and as a small desktop app, with plain `.md` files in a local folder.

## Main hypothesis
> The owner will keep all his notes in Snowlog if it is as comfortable day to day as a desktop Markdown notes app
> (daily note, links, tasks, queries) while nobody else, GitHub included, can read them.

## What it really competes with
Desktop Markdown notes apps with a paid sync service, cloud notes services, a plain folder of `.md` files with git,
and paper.

## Differentiators
1. End-to-end encryption with a key derived from the passphrase, which never leaves the device; GitHub only stores
   random file names and ciphertext.
2. No server of its own: a static site, a private repository and a tiny Worker only for the sign-in.
3. Works anywhere: the web (also offline, as an installable app), one portable HTML file with no network at all,
   or a desktop app; notes move between them with an encrypted backup.
4. History, conflict merging between devices and backups come from git, without another service.

## What NOT to do
- Never upload anything in plaintext to the notes repository: no content, titles, paths or credentials.
- Don't add a backend that stores notes or keys, analytics, telemetry or third-party scripts and styles (no CDN).
- Don't relax the CSP or Trusted Types; the portable build keeps `connect-src 'none'`.
- Don't add runtime dependencies or frameworks: plain JavaScript modules, no build step for the web.
- Don't copy another notes app's code, icons or assets, or use its name in the app.
- Don't use `innerHTML` with note text unless it went through `markdown.js`.
- Don't read or touch the owner's real notes, and don't run the MCP server against them unless he asks.

## How we'll know it works
- The owner uses Snowlog for his real daily notes on every device, instead of another notes app.
- Every release passes the unit tests and the browser walkthroughs, including "nothing in plaintext in the
  repository" and the portable file opened from disk with no network.
- An independent review of the encryption and the CSP finds no open High issues.
