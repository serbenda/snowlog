# 0002 — Stack: a static site in plain JavaScript, with no runtime dependencies

- **Status:** accepted (recorded afterwards, when the project adopted project-template 1.0.0)
- **Date:** 2026-11-09

## Context
Snowlog decrypts private notes in the browser. Any code it loads can read them, so every line that runs on the
page is part of the security boundary. It is served from GitHub Pages, which only serves static files.

## Options
| Option | Pros | Cons |
|---|---|---|
| A. Plain ES modules served as they are, our own Markdown renderer | Smallest attack surface; no dependencies to audit or update; a strict CSP with Trusted Types; easy to bundle into one file | More code of our own (Markdown, editor, queries, graph) |
| B. A framework and npm libraries (Markdown, editor, crypto) | Faster to build features | A build step and a supply chain inside the page that holds the key; a looser CSP |

## Challenge
None at the time: the decision predates the template's challenge rule.

## Decision
Option A: HTML, CSS and plain JavaScript modules in `public/`, served as they are, with WebCrypto for the
encryption and our own Markdown renderer that escapes everything before formatting. Tests use only `node --test`
and Chrome over the DevTools protocol.

## Consequences
- No `npm install` for the site, the tests or the portable build; `package.json` has no dependencies.
- No CDN, external script or style: the CSP stays `script-src 'self'`, `style-src 'self'` with Trusted Types.
- New modules use only `import { … } from './x.js'` or `import * as X from './x.js'` and `export function|const|class`,
  which is what the portable bundler understands.
