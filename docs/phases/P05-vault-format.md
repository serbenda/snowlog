# P05 — The vault format, written down and tested

- **Stage:** S3
- **Status:** ✅ done
- **Issue:** —
- **Dates:** 2026-11-26 → 2026-11-26
- **Owner approvals:** 2026-11-26 "Sí, empieza" (the review of Snowlog, after bsketch's)

## Goal
A notebook must never lose notes: every vault an earlier version made keeps opening, and anyone can see what is
stored and how.

## Scope
**In:**
- `docs/FORMAT.md`: the repository's files, the encryption (cipher, IVs, AADs, the data key), `vault.json`, the
  decrypted index, local folders, what stays on the device, and the compatibility promise.
- `scripts/make-vault-fixtures.mjs`: a vault made by the code of each version that changed it (PRs #1, #4, #5, #6,
  #7, #9 and #16, from temporary git worktrees), with the same story as far as each version could (notes, an edit, a
  rename, a deletion, attachments, the library, a key rotation, a note written after it).
- `tests/vault-compat.test.mjs`: each one opens at the app's real PBKDF2 cost, every note and attachment reads back
  exactly, it can be written to, its recovery code still works, and FORMAT.md documents every field.
- [ADR 0008](../decisions/0008-vault-format-version-1.md).

**Out:**
- Vaults from before PR #1 (there were none in use); local folders' format beyond its description (plain Markdown).

## Acceptance criteria
- [x] A vault from every version that changed the vault code opens with nothing lost, can be written to and recovered.
- [x] FORMAT.md documents every field of `vault.json` and of the index (tested).
- [x] `npm test` passes.

## Security impact
- None: tests and documentation. The document helps outside review (R-001).

---

## Result
- **What was done:** as in *In*.
- **How it was tested:** `npm test` (the 9 compatibility tests run in about 1.5 s).
- **Lessons learned:** the vault code's interface hasn't changed since PR #1, so one script can drive every
  version's own code: the fixtures are what each version really wrote, not a hand-made imitation.
- **PR:** see the development → main PR.
