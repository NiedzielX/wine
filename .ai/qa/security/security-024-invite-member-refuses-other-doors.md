---
id: security-024-invite-member-refuses-other-doors
area: security
title: "Inviting from the team screen is refused outside your own restaurant and role"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries-writes.e2e.test.ts
  it: "T-36: inviteMember (useActionState): both restaurants' managers invite in their own; another slug, a Wine Director, no session and a role above your own are refused and leave no invitation"
---

# security-024-invite-member-refuses-other-doors: Inviting from the team screen is refused outside your own restaurant and role

## Goal

The team screen's invitation form (a form whose answer carries the link once) works only for a manager of that restaurant within the hierarchy (threat T-36).

## Given

1. Tomasz (Halka manager), Anna (Bistro owner), Marta and Sonia (Wine Directors) are signed in.

## When

1. Tomasz and Anna invite a Wine Director in their own restaurant, with planted restaurant and platform fields (positive control).
2. Tomasz invites in Bistro, Anna in Halka, the Wine Directors in their own restaurants, Tomasz an owner, and a visitor without a session.

## Then

1. The positive controls answer with the link once; the invitation is in that restaurant with that role.
2. Every refused attempt answers an error without a link; the visitor is sent to sign in.
3. No invitation and no other row is added.

## Edge cases covered

- Mutation proof recorded in the run log (`.ai/runs/2026-11-09-boundaries-part2.md`).

## Data and cleanup

- Invitations are removed by the database restore.

## Test implementation

[packages/app/tests/e2e/access-boundaries-writes.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries-writes.e2e.test.ts): `T-36: inviteMember (useActionState): both restaurants' managers invite in their own; another slug, a Wine Director, no session and a role above your own are refused and leave no invitation`
