# Risk register

> The bar for release is not "everything is coded" but "no High risks open".
> States: `OPEN` → `MITIGATED` (fixed and covered by tests) → `CLOSED` (validated in the real world).

| ID | Risk | Impact | Probability | State | Mitigation | Phase |
|---|---|---|---|---|---|---|
| R-001 | The home-made encryption design has a flaw nobody outside has looked for | High | Low | MITIGATED | Internal review, then an independent review (P02, by an agent that hadn't seen the code): one High (a KDF downgrade through recovery) and one Medium (rollback of a key rotation) on `vault.json`, both fixed with tests ([P02](phases/P02-security-review.md)); a paid external audit stays the owner's option | P02 |
| R-002 | Someone with write access to the notes repository puts back an older encrypted version of a note or the index | Medium | Low | OPEN | Cannot read or forge content (AES-GCM, id as AAD); an older `vault.json` is now refused (sealed epochs, P02); for notes and the index, detection still needs a signed index with a counter | — |
| R-003 | The GitHub sign-in uses `state` but not PKCE | Low | Low | OPEN | The code is useless without the client secret, which stays in the Worker; adding PKCE needs a Worker change | — |
| R-004 | The portable file is untested on real Firefox and Safari, and the app on real phones, macOS and Windows | Medium | Medium | OPEN | Tested in Chrome simulating a browser without folder access; owner tests on real devices | P02 |
| R-005 | Unsigned desktop executables are blocked or flagged on company computers | Medium | High | OPEN | The portable HTML file is offered for those computers; signing only if the owner decides to pay for it | — |
| R-006 | A vault with the earlier Spanish folder names stops finding its daily notes after the English translation | Medium | Low | MITIGATED | `workspaceSettings` keeps the legacy names when the vault uses them; local folders still read `.snowlog/ajustes.json`; tests in `templates.test.mjs` and `localvault.test.mjs` | P01 |
| R-007 | While the MCP server is unlocked, its client (an AI agent) can read the whole vault | Medium | Medium | OPEN | Documented in [AGENT_ACCESS.md](AGENT_ACCESS.md); the key is forgotten after 10 minutes unused; never run it against the real notes unless the owner asks | — |
| R-008 | Snowlog's copy of the drawing engine drifts from sketch | Low | Medium | MITIGATED | `scripts/update-sketch.mjs` copies a given commit and names it in each file's header; updated to sketch's English file names | P01 |
| R-009 | In the portable file, "Store inside the browser" keeps the notes in the storage of `file://` pages, which some browsers share between every local HTML file: another downloaded `.html` opened in the same browser could read them | Medium | Low | OPEN | Warned in [PORTABLE.md](PORTABLE.md); to be checked on real Firefox and Safari (R-004); a folder or the online version avoid it | P02 |

## How to use it
- Any phase that touches data, authentication, dependencies or deployment reviews this table.
- A `MITIGATED` risk needs a test or check that proves it, linked in *Mitigation*.
- Security risks are cross-checked with the `security-audit` skill (see [SECURITY_GUIDE.md](SECURITY_GUIDE.md)).
