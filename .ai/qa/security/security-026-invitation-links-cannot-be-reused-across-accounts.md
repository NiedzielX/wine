---
id: security-026-invitation-links-cannot-be-reused-across-accounts
area: security
title: "Invitation links cannot be reused across accounts, after expiry, revocation or use"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries-writes.e2e.test.ts
  it: "T-36: accepting an invitation: another tenant's link refuses a signed-in other account and an anonymous caller; expired, revoked and used links are dead; replay after success grants nothing"
---

# security-026-invitation-links-cannot-be-reused-across-accounts: Invitation links cannot be reused across accounts, after expiry, revocation or use

## Goal

An invitation link works once, for its own e-mail and restaurant, and for nobody else (threat T-36).

## Given

1. Halka invites Anna, the owner of Bistro E2E (an account of another restaurant). Two more Halka links are made: one expires, one is revoked.

## When

1. The link to Anna is used by a visitor, by Marta and by Sonia (with planted restaurant and role fields).
2. The expired, the revoked and a made-up link are used.
3. Anna uses her link (positive control) and it is used again by her, a visitor and Tomasz.
4. A new person accepts a Bistro link with planted fields naming Halka, then tries the spent links again.

## Then

1. The visitor is asked to sign in, the other accounts are told the link is for another account; nothing is written.
2. Expired, revoked and made-up links all show the same dead-link answer and write nothing.
3. Anna joins Halka with the invited role and keeps Bistro; every replay is a dead link and writes nothing.
4. The new person is in Bistro only, with the invited role, and has no access to Halka.

## Edge cases covered

- Mutation proof recorded in the run log (`.ai/runs/2026-11-09-boundaries-part2.md`).

## Data and cleanup

- Accounts, memberships and links are removed by the database restore.

## Test implementation

[packages/app/tests/e2e/access-boundaries-writes.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries-writes.e2e.test.ts): `T-36: accepting an invitation: another tenant's link refuses a signed-in other account and an anonymous caller; expired, revoked and used links are dead; replay after success grants nothing`
