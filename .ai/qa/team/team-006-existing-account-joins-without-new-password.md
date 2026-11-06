---
id: team-006-existing-account-joins-without-new-password
area: team
title: "Existing account joins by link and keeps its password"
status: automated
spec:
  path: .ai/specs/2026-11-04-staff-accounts-and-roles.md
  ac: ["AC8"]
test:
  file: packages/app/tests/e2e/invitations.e2e.test.ts
  it: "an e-mail with an account and one without get the same answer from the inviter; the existing account must sign in, joins with the link and keeps its password (AC8)"
---

# team-006-existing-account-joins-without-new-password: Existing account joins by link and keeps its password

## Goal

Inviting an e-mail with an account looks the same to the inviter as inviting one without; the existing account must be signed in and keeps its password.

## Given

1. Bistro E2E has an owner (signed in); Tomasz of Halka has an account; another e-mail has none.

## When

1. The owner invites both e-mails.
2. Someone forges a post with the token for Tomasz and a password of their choice, not signed in.
3. Tomasz signs in with his own password, opens the link and joins.

## Then

1. Both answers have the same shape, role, link form and expiry.
2. The page for Tomasz offers sign-in and no password field; the forged post redirects to sign_in_required, his password hash is unchanged and he has no membership.
3. Signed in, the page offers a plain join; the post adds a membership and sets no cookie; the hash is unchanged and the old password still signs in.

## Edge cases covered

- A forged password for an existing account is ignored.

## Data and cleanup

- Adds and removes Tomasz's membership in Bistro E2E.

## Test implementation

[packages/app/tests/e2e/invitations.e2e.test.ts](../../../packages/app/tests/e2e/invitations.e2e.test.ts): `an e-mail with an account and one without get the same answer from the inviter; the existing account must sign in, joins with the link and keeps its password (AC8)`
