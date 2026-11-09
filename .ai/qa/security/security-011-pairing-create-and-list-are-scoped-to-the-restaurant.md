---
id: security-011-pairing-create-and-list-are-scoped-to-the-restaurant
area: security
title: "Pairing create and list are scoped to the restaurant"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts
  it: "T-26: pairing create and list: a foreign dish or wine id cannot be paired in your restaurant, the list is scoped, and no row changes"
---

# security-011-pairing-create-and-list-are-scoped-to-the-restaurant: Pairing create and list are scoped to the restaurant

## Goal

A Wine Director cannot create a pairing from a dish or a wine of another restaurant, and the pairing list shows nothing of it. (threat T-26, docs/security/threat-model.md).

## Given

1. Halka (Marta, Wine Director; Tomasz, manager) and Bistro E2E (Sonia, Wine Director) both have dishes, wines and pairings (Bistro from the sample imports).
2. Bistro E2E gets the sample wine list and menu (confirmed imports) in `beforeAll` when it has no dishes, so its positive controls read real rows.

## When

1. Positive controls: Marta and Sonia each create a pairing of their own dish and wine: 201.
2. Foreign dish, foreign wine, both foreign, Halka account with Bistro ids, an extra body field: refused; Sonia on the Halka slug and a manager on pairing create: 403.

## Then

1. Refused with 404 or 422, never 2xx. The list filtered by a foreign dish id is 200 and empty; the other slug is 403 without the other restaurant's names.
2. Payloads and table digest unchanged.

## Edge cases covered

- Mutation proof recorded in the run log (`.ai/runs/2026-11-08-boundaries-part1.md`).

## Data and cleanup

- Objects created by the controls (pairings, staged imports) are removed in the test or `afterAll`; the sample imports of Bistro E2E stay.

## Test implementation

[packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts): `T-26: pairing create and list: a foreign dish or wine id cannot be paired in your restaurant, the list is scoped, and no row changes`
