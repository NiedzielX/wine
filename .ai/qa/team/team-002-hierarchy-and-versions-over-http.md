---
id: team-002-hierarchy-and-versions-over-http
area: team
title: "Hierarchy and versions hold over HTTP"
status: automated
spec:
  path: .ai/specs/2026-11-04-staff-accounts-and-roles.md
  ac: ["AC3", "AC4"]
test:
  file: packages/app/tests/e2e/team.e2e.test.ts
  it: "the hierarchy holds over HTTP: a manager cannot touch the owner, grant owner or manager, or change themselves; a stale or missing version is refused"
---

# team-002-hierarchy-and-versions-over-http: Hierarchy and versions hold over HTTP

## Goal

A general manager cannot change or remove an owner, cannot grant `owner` or `manager`, and nobody removes their own access; a change needs the version the caller read.

## Given

1. Bistro E2E has its owner, a general manager and a Wine Director.
2. The manager and the owner are signed in.

## When

1. The manager tries to change the owner's role, to remove the owner's access, and to make the Wine Director an owner or a manager.
2. The manager tries to remove their own access; the owner tries to remove their own access.
3. The manager changes the Wine Director's role without `If-Match`, with the current version, and again with the same (now stale) version.
4. The owner restores the Wine Director's role.

## Then

1. The four attempts on the owner and the grants answer 403 with the code `team_hierarchy`.
2. Removing one's own access answers 422 `self_change` for the manager and 422 for the owner (the restaurant keeps its owner).
3. Without `If-Match` the answer is 428.
4. With the current version the change passes (200); the same version again is 409 `version_conflict`.
5. The owner is still an active owner at the same version.

## Edge cases covered

- A manager may give the roles Wine Director and Waiter only.
- Last active owner protection under concurrency is checked on PostgreSQL in the integration suite (two connections), not here.

## Data and cleanup

- Works on the shared e2e database; the Wine Director's role is put back to sommelier.

## Test implementation

[packages/app/tests/e2e/team.e2e.test.ts](../../../packages/app/tests/e2e/team.e2e.test.ts): `the hierarchy holds over HTTP: a manager cannot touch the owner, grant owner or manager, or change themselves; a stale or missing version is refused`
