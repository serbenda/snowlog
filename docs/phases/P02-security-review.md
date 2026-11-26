# P02 — Independent security review, and tests on real devices

- **Stage:** S3
- **Status:** ⏳ in progress
- **Issue:** —
- **Dates:** 2026-11-26 → —
- **Owner approvals:** 2026-11-26 "empieza tú"

## Goal
Snowlog's first release ships with no known High security finding ([R-001](../RISKS.md)) and is known to work on the
browsers and devices people use ([R-004](../RISKS.md)).

## Scope
**In:**
- **The agent:** an independent review of the code by a sub-agent that hasn't seen the earlier work: the encryption
  (keys, AES-GCM, AAD, rotation), sign-in and the Worker, storage, rendering (Markdown, links, attachments, the embedded
  editor), the service worker and CSP, the portable file, the desktop app and the agent access (MCP). Every finding is
  checked with a script, fixed and covered by a test, or recorded as a risk when it is the owner's decision. Also:
  axe-core, a performance check with a big vault, and fuzzing of the parsers.
- **The owner:** the portable file on real Firefox and Safari; the app on real phones, macOS and Windows.

**Out:**
- A paid external audit (the owner's decision); new features.

## Acceptance criteria
- [ ] Every security finding fixed with a test, or recorded as a risk with the owner's decision.
- [ ] No High finding open; R-001 updated.
- [ ] axe-core: no violation in the main states.
- [ ] `npm test` and `npm run test:e2e` pass.
- [ ] The owner's tests on real devices (R-004).

## Security impact
- Lowers it: findings fixed; what can't be fixed is written down.
