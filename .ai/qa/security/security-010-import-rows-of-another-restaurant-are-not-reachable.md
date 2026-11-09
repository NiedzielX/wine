---
id: security-010-import-rows-of-another-restaurant-are-not-reachable
area: security
title: "Import rows of another restaurant are not reachable"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts
  it: "T-25: import rows: correcting rows of another restaurant's import is refused (404 by id, 403 by slug) and changes nothing"
---

# security-010-import-rows-of-another-restaurant-are-not-reachable: Import rows of another restaurant are not reachable

## Goal

An account of restaurant A cannot correct the rows of restaurant B's staged import, by id under A's slug or by B's slug. (threat T-25, docs/security/threat-model.md).

## Given

1. Halka and Bistro E2E each have a staged wine import; Tomasz (Halka manager), Anna (Bistro owner) and Sonia (Bistro Wine Director) are signed in.
2. Bistro E2E gets the sample wine list and menu (confirmed imports) in `beforeAll` when it has no dishes, so its positive controls read real rows.

## When

1. Positive controls: Tomasz corrects rows of the Halka import and Anna rows of the Bistro import: 200.
2. Anna sends the Halka import id under the Bistro slug and Tomasz the Bistro id under the Halka slug; Anna and Sonia use the Halka slug; Tomasz the Bistro slug.

## Then

1. Foreign id under the own slug: 404, body without the other restaurant name, file name, dishes or wines. Other slug: 403.
2. Both imports (whole payloads), both pairing lists, both teams, the Halka public menu and the digest of 14 tables are identical before and after.

## Edge cases covered

- Mutation proof recorded in the run log (`.ai/runs/2026-11-08-boundaries-part1.md`).

## Data and cleanup

- Objects created by the controls (pairings, staged imports) are removed in the test or `afterAll`; the sample imports of Bistro E2E stay.

## Test implementation

[packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts): `T-25: import rows: correcting rows of another restaurant's import is refused (404 by id, 403 by slug) and changes nothing`
