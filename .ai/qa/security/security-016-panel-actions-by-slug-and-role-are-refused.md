---
id: security-016-panel-actions-by-slug-and-role-are-refused
area: security
title: "Panel actions by slug and role are refused"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts
  it: "T-31: panel server actions by slug and role: the other restaurant's slug and a role below the permission are refused (forbidden) and change nothing"
---

# security-016-panel-actions-by-slug-and-role-are-refused: Panel actions by slug and role are refused

## Goal

Settings, details, content, suggestions, publish, bulk approve and upload are refused under another restaurant's slug and for a role below the permission; a restaurant cannot be renamed to another one's slug. (threat T-31, docs/security/threat-model.md).

## Given

1. Tomasz and Marta (Halka), Anna, Marek and Sonia (Bistro E2E) are signed in.
2. Bistro E2E gets the sample wine list and menu (confirmed imports) in `beforeAll` when it has no dishes, so its positive controls read real rows.

## When

1. Positive controls: details, content, guest settings, suggestions and publish of the own restaurant: `saved=`.
2. Each action under the other slug; a rename to the other restaurant's slug; the team actions (role, deactivate, reactivate, revoke invitation) under the other slug; a manager approving pairings; a Wine Director editing details.

## Then

1. `error=forbidden` and never `saved=`; the slug rename is not saved.
2. Payloads, digest and both restaurant names unchanged.

## Edge cases covered

- Mutation proof recorded in the run log (`.ai/runs/2026-11-08-boundaries-part1.md`).

## Data and cleanup

- Objects created by the controls (pairings, staged imports) are removed in the test or `afterAll`; the sample imports of Bistro E2E stay.

## Test implementation

[packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts): `T-31: panel server actions by slug and role: the other restaurant's slug and a role below the permission are refused (forbidden) and change nothing`
