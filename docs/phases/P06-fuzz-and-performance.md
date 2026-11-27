# P06 — Fuzzing and a big vault

- **Stage:** S3
- **Status:** ✅ done
- **Issue:** —
- **Dates:** 2026-11-26 → 2026-11-27
- **Owner approvals:** 2026-11-26 "Sí, empieza" (the review of Snowlog, after bsketch's)

## Goal
Whatever text a note, an import or a file brings, Snowlog doesn't break, hang or let markup through; and a vault of
thousands of notes stays fast.

## Scope
**In:**
- `tests/fuzz.test.mjs`: seeded random input (Markdown pieces, query words, tricky characters) for the renderer
  (finishes quickly; only allowed tags, no event attributes, no `javascript:` links), queries, search, Kanban boards
  (a round trip is stable), zips (junk refused cleanly; written files read back), merging (one side unchanged gives
  the other), links, note parsing, templates, backups and the graph. `FUZZ_SEED` and `FUZZ_RUNS` as in bsketch.
- `tests/perf.test.mjs`: 5,000 notes with links, tags and tasks: indexing, search, a query, the graph, a 4,000-line
  note, a merge of it, a backup zip and reading it back, with budgets.

**Out:**
- The interface with a big vault in the browser (the tree, the switcher): with the e2e work.

## Acceptance criteria
- [x] A long campaign finds nothing left: 12 seeds × 5,000 runs (after fixing what it found).
- [x] 5,000 notes within budget.
- [x] `npm test` passes.

## Security impact
- Lowers it: a crash in the Kanban parser fixed (a column title with `\r` or U+2028 left a line with no column).

---

## Result
- **What was done:** as in *In*. Found and fixed: the Kanban crash above (with a test in `kanban.test.mjs`). The
  other two first failures were the test's own (escaped text inside an attribute; `<dl>` for note properties).
- **Performance (5,000 notes, 5.7 MB as a zip):** index 34 ms, search 94 ms, query 2 ms, graph 5 ms, a 4,000-line
  note 9 ms, its merge 2 ms, backup zip 26 ms, reading it 10 ms.
- **Lessons learned:** two tests that should agree (where the text before the first column ends, and what a column
  heading is) must be the same test.
- **PR:** see the development → main PR.
