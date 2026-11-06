---
id: team-007-dead-links-and-forged-posts-change-nothing
area: team
title: "Dead links look alike and forged posts change nothing"
status: automated
spec:
  path: .ai/specs/2026-11-04-staff-accounts-and-roles.md
  ac: ["AC7", "AC24"]
test:
  file: packages/app/tests/e2e/invitations.e2e.test.ts
  it: "dead links all look alike: cancelled, expired, an inviter who lost access, and a link of another restaurant; a cross-site forged post changes nothing (AC7, AC24)"
---

# team-007-dead-links-and-forged-posts-change-nothing: Dead links look alike and forged posts change nothing

## Goal

A cancelled, expired or orphaned link, a forged cross-site post and a link of another restaurant all end the same way: nothing is created and nothing leaks.

## Given

1. Bistro E2E has an owner, a manager and a Wine Director; Halka has a manager.

## When

1. Open and post an unknown token, a cancelled invitation, an expired one, and one made by a manager whose access the owner then removes (and restores).
2. Post the accept form and the A15 invite form from another site (forged Origin).
3. Cancel a Halka invitation from Bistro E2E, and invite across restaurants.

## Then

1. Every dead link is a 404 page and a redirect to the same error, with no cookie and no account.
2. A cross-site post creates no account and no invitation and leaves the link usable; the same post from the site itself works.
3. Cross-restaurant cancel is 403 or 404 and invitations across restaurants are 403.

## Edge cases covered

- Expiry is forced by moving expires_at into the past.
- The inviter's access is removed and restored through the team API.

## Data and cleanup

- Creates invitations; removed after the file runs; the invited manager's access is restored.

## Test implementation

[packages/app/tests/e2e/invitations.e2e.test.ts](../../../packages/app/tests/e2e/invitations.e2e.test.ts): `dead links all look alike: cancelled, expired, an inviter who lost access, and a link of another restaurant; a cross-site forged post changes nothing (AC7, AC24)`
