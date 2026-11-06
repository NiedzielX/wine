---
id: team-008-invitation-api-follows-the-hierarchy
area: team
title: "The invitation API follows the hierarchy"
status: automated
spec:
  path: .ai/specs/2026-11-04-staff-accounts-and-roles.md
  ac: ["AC24"]
test:
  file: packages/app/tests/e2e/invitations.e2e.test.ts
  it: "the invitation API refuses what the hierarchy and the team do: a manager inviting a manager, a person already in the team, a sommelier, no CSRF; the list never shows a link"
---

# team-008-invitation-api-follows-the-hierarchy: The invitation API follows the hierarchy

## Goal

A manager invites only a Wine Director, a person already in the team is named, a Wine Director has no access, and the list never shows a link.

## Given

1. Bistro E2E has an owner, a manager and a Wine Director (all signed in).

## When

1. The manager invites an owner and a manager; the Wine Director tries to invite and to list.
2. The owner invites someone already in the team (upper case), a waiter, and posts without a CSRF token or session.
3. The owner invites a manager, lists, and the manager tries to cancel it.

## Then

1. 403 team_hierarchy for the manager; 403 for the Wine Director; 409 already_member; 422 for a waiter; 403 without CSRF, 401 without a session; nothing was created.
2. The list shows the address but no token or link; the manager's cancel is 403 team_hierarchy, a bad id 404, the owner's cancel 204.

## Edge cases covered

- Letter case of the e-mail does not hide a member.

## Data and cleanup

- Creates and cancels invitations.

## Test implementation

[packages/app/tests/e2e/invitations.e2e.test.ts](../../../packages/app/tests/e2e/invitations.e2e.test.ts): `the invitation API refuses what the hierarchy and the team do: a manager inviting a manager, a person already in the team, a sommelier, no CSRF; the list never shows a link`
