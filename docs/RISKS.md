# Risk register

> The bar for release is not "everything is coded" but "no High risks open".
> States: `OPEN` → `MITIGATED` (fixed and covered by tests) → `CLOSED` (validated in the real world).

| ID | Risk | Impact | Probability | State | Mitigation | Phase |
|---|---|---|---|---|---|---|
| R-001 | The home-made encryption design has a flaw nobody outside has looked for | High | Low | OPEN | Internal review with its findings fixed ([THREAT_MODEL.md](THREAT_MODEL.md)); an independent review is due before the release | P02 |
| R-002 | Someone with write access to the notes repository puts back an older encrypted version of a note or the index | Medium | Low | OPEN | Cannot read or forge content (AES-GCM, id as AAD); detection needs a signed index with a counter | — |
| R-003 | The GitHub sign-in uses `state` but not PKCE | Low | Low | OPEN | The code is useless without the client secret, which stays in the Worker; adding PKCE needs a Worker change | — |
| R-004 | The portable file is untested on real Firefox and Safari, and the app on real phones, macOS and Windows | Medium | Medium | OPEN | Tested in Chrome simulating a browser without folder access; owner tests on real devices | P02 |
| R-005 | Unsigned desktop executables are blocked or flagged on company computers | Medium | High | OPEN | The portable HTML file is offered for those computers; signing only if the owner decides to pay for it | — |
| R-006 | A vault with the earlier Spanish folder names stops finding its daily notes after the English translation | Medium | Low | MITIGATED | `workspaceSettings` keeps the legacy names when the vault uses them; local folders still read `.snowlog/ajustes.json`; tests in `templates.test.mjs` and `localvault.test.mjs` | P01 |
| R-007 | While the MCP server is unlocked, its client (an AI agent) can read the whole vault | Medium | Medium | OPEN | Documented in [AGENT_ACCESS.md](AGENT_ACCESS.md); the key is forgotten after 10 minutes unused; never run it against the real notes unless the owner asks | — |
| R-008 | Snowlog's copy of the drawing engine drifts from sketch | Low | Medium | MITIGATED | `scripts/update-sketch.mjs` copies a given commit and names it in each file's header; updated to sketch's English file names | P01 |

## How to use it
- Any phase that touches data, authentication, dependencies or deployment reviews this table.
- A `MITIGATED` risk needs a test or check that proves it, linked in *Mitigation*.
- Security risks are cross-checked with the `security-audit` skill (see [SECURITY_GUIDE.md](SECURITY_GUIDE.md)).
