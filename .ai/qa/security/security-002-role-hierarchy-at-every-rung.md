---
id: security-002-role-hierarchy-at-every-rung
area: security
title: "Role hierarchy holds at every rung"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries.e2e.test.ts
  it: "T-02: the role hierarchy holds at every rung: a manager cannot grant or touch up, a Wine Director cannot manage the team, extra body fields are refused, and the team is unchanged"
---

# security-002-role-hierarchy-at-every-rung: Role hierarchy holds at every rung

## Goal

A manager cannot grant or touch anyone above a Wine Director, a Wine Director cannot manage the team, and fields outside the schema are refused. (threat T-02, docs/security/threat-model.md).

## Given

1. Bistro E2E has an owner (Anna), a general manager (Marek) and a Wine Director (Sonia), all signed in.

## When

1. Positive controls: the owner changes a member without changing anything (200); Marek invites a Wine Director (201) and cancels the invitation (204).
2. Marek tries to grant owner or manager, to deactivate or demote the owner, to promote himself, to invite an owner or a manager.
3. Sonia tries to promote herself, to change the owner, to invite, and to read the team and invitations.
4. The owner sends a role change with extra fields (`restaurantId`, `userId`) and an invitation with `platform: true`.

## Then

1. Hierarchy attempts answer 403 (self change 422); extra fields answer 422; Sonia's reads answer 403 and carry no e-mail of the owner.
2. Team and invitation payloads and the table digest are identical before and after.

## Edge cases covered

- Sommelier role cannot reach `team.manage` reads either.

## Data and cleanup

- Creates and cancels one invitation; leaves the team as it found it.

## Test implementation

[packages/app/tests/e2e/access-boundaries.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries.e2e.test.ts): `T-02: the role hierarchy holds at every rung: a manager cannot grant or touch up, a Wine Director cannot manage the team, extra body fields are refused, and the team is unchanged`
