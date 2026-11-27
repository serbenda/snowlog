# 0008 — The vault format version 1, and the promise to keep reading it

- **Status:** accepted
- **Date:** 2026-11-26

## Context
Snowlog's vault format grew with each release (attachments, the keyring, the library, the epoch seal) without a
written description or a test that old vaults still open. Losing access to notes is the worst thing a notebook can
do, and the encryption design needs a document outsiders can review (R-001).

## Options
| Option | Pros | Cons |
|---|---|---|
| A. Document version 1 and promise to read it for ever; only optional fields added; tests with vaults made by each version | Matches how it grew; nothing to migrate; verifiable | New features must fit as optional fields |
| B. A new, cleaner version 2 before the first release, with a migration | A tidier format | Migration code and risk for every existing vault |

## Challenge
Could an optional field hide a security downgrade (a vault without the new field)? Yes: that is why fields that
protect against tampering are designed to fail closed once a device has seen them (a missing seal counts as epoch 0,
lower than any epoch the device has opened since).

## Decision
Option A, in [docs/FORMAT.md](../FORMAT.md), enforced by `tests/vault-compat.test.mjs`.

## Consequences
- Every release that changes the vault code adds a fixture (`node scripts/make-vault-fixtures.mjs`).
- A field can't be renamed, removed or change meaning; a version 2 would need asking before migrating.
