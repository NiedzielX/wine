---
id: security-017-slug-level-api-routes-are-refused-with-no-data
area: security
title: "Slug-level API routes are refused with no data"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts
  it: "T-32: slug-level API routes (QR, publish, bulk decision, pairing list): both accounts work on their own restaurant, the other slug is 403 with no data and no row changes"
---

# security-017-slug-level-api-routes-are-refused-with-no-data: Slug-level API routes are refused with no data

## Goal

QR, publish, bulk decision and the pairing list of a restaurant are refused for the other restaurant's accounts and for no session. (threat T-32, docs/security/threat-model.md).

## Given

1. Marta and Sonia (Wine Directors), Tomasz and Anna (manager and owner) are signed in.
2. Bistro E2E gets the sample wine list and menu (confirmed imports) in `beforeAll` when it has no dishes, so its positive controls read real rows.

## When

1. Positive controls: Marta and Sonia read the QR code and the list, bulk-approve and publish their own restaurant: 200 or 201.
2. The same four calls under the other slug (as Wine Director and as owner or manager); a manager's bulk decision; the QR code without a session.

## Then

1. 403 for the other slug and for a manager's bulk decision, 401 without a session, no name of the other restaurant in any body.
2. Payloads and table digest unchanged.

## Edge cases covered

- Mutation proof recorded in the run log (`.ai/runs/2026-11-08-boundaries-part1.md`).

## Data and cleanup

- Objects created by the controls (pairings, staged imports) are removed in the test or `afterAll`; the sample imports of Bistro E2E stay.

## Test implementation

[packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts): `T-32: slug-level API routes (QR, publish, bulk decision, pairing list): both accounts work on their own restaurant, the other slug is 403 with no data and no row changes`
