---
id: security-001-foreign-object-ids-are-not-reachable
area: security
title: "Object ids of another restaurant are not reachable"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries.e2e.test.ts
  it: "T-01: an id of another restaurant is not reachable through your own restaurant: 404, 403 for the other slug, and no row anywhere changes"
---

# security-001-foreign-object-ids-are-not-reachable: Object ids of another restaurant are not reachable

## Goal

Account of restaurant A cannot read or change an object of restaurant B by putting its id under A's own restaurant, and cannot use B's slug at all. (threat T-01, docs/security/threat-model.md).

## Given

1. Halka has a Wine Director (Marta) and a general manager (Tomasz); Bistro E2E has a Wine Director (Sonia) and an owner (Anna), all signed in.
2. Halka has a pairing, a wine, a staged import, a team member and a pending invitation; Bistro has a staged import and a team member.

## When

1. Positive controls: each account reads or changes its own data (pairings, wine toggle, imports, team, invitations) and gets 200.
2. Bistro accounts send 9 writes with Halka ids under the Bistro slug (pairing approve, comment, delete; wine hide; import cancel and confirm; team role and deactivate; invitation revoke) and Halka's accounts send 2 with Bistro ids under the Halka slug.
3. They also read with a foreign id, and read and write under the other restaurant's slug.

## Then

1. Every foreign id under the own slug answers 404; the other restaurant's slug answers 403 and the body names no file name or e-mail of that restaurant.
2. Whole payloads of both restaurants (pairings, imports, team, invitations) are identical before and after, and a digest of 12 tables is identical.

## Edge cases covered

- The same attack with the import repository scoping removed turns the test red (mutation check recorded in the run log).

## Data and cleanup

- Stages two imports and an invitation and cancels or revokes them in `afterAll`; no other state is created.

## Test implementation

[packages/app/tests/e2e/access-boundaries.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries.e2e.test.ts): `T-01: an id of another restaurant is not reachable through your own restaurant: 404, 403 for the other slug, and no row anywhere changes`
