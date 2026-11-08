---
id: security-013-public-recommendations-never-serve-another-restaurants-dish
area: security
title: "Public recommendations never serve another restaurant's dish"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts
  it: "T-28: recommendations of the public route: another restaurant's dish id under your slug is 404 with none of its data; a draft dish is not served"
---

# security-013-public-recommendations-never-serve-another-restaurants-dish: Public recommendations never serve another restaurant's dish

## Goal

The public recommendations route answers 404 for a dish that is not a published dish of the restaurant in the query. (threat T-28, docs/security/threat-model.md).

## Given

1. Halka has published dishes; Bistro E2E has only draft dishes (imported, not approved).
2. Bistro E2E gets the sample wine list and menu (confirmed imports) in `beforeAll` when it has no dishes, so its positive controls read real rows.

## When

1. Positive control: a published Halka dish under the Halka slug: 200 (Bistro has no published dish, a gap in the run log).
2. The same Halka dish id under the Bistro slug, and a Bistro draft dish under its own slug.

## Then

1. Both: 404 and no Halka wine, dish or restaurant name in the body.
2. Payloads and table digest unchanged.

## Edge cases covered

- Mutation proof recorded in the run log (`.ai/runs/2026-11-08-boundaries-part1.md`).

## Data and cleanup

- Objects created by the controls (pairings, staged imports) are removed in the test or `afterAll`; the sample imports of Bistro E2E stay.

## Test implementation

[packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts): `T-28: recommendations of the public route: another restaurant's dish id under your slug is 404 with none of its data; a draft dish is not served`
