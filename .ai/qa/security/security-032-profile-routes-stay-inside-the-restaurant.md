---
id: security-032-profile-routes-stay-inside-the-restaurant
area: security
title: "Profile routes stay inside the restaurant"
status: automated
spec:
  path: .ai/specs/2026-11-04-panel-completion.md
  ac: ["AC14"]
test:
  file: packages/app/tests/e2e/profile-editing.e2e.test.ts
  it: "both accounts may edit their own restaurant; refused reads and writes by the other restaurant leave every table as it was, and a foreign id is not found"
---

# security-032-profile-routes-stay-inside-the-restaurant: Profile routes stay inside the restaurant

## Goal

The profile routes work for the own restaurant and are closed to the other one, and a foreign dish id is not found.

## Given

1. Two accounts: the Wine Director of Halka and the owner of Bistro E2E; a dish in each restaurant.

## When

1. Each account reads the fingerprint and saves a profile of a dish of its own restaurant.
2. Each account tries to read, save and preview the other restaurant's dish by slug, and its own slug with the other's dish id; one save is sent without If-Match.

## Then

1. Both own-restaurant saves answer 200 and write one audit row each.
2. Every foreign slug answers 403 and every foreign id under an own slug answers 404; a save without If-Match answers 428.
3. Every table digest and both profiles are exactly as before the refused attempts.

## Edge cases covered

- The waiter has no dashboard login at all (sign-in answers 403), so his refusal is asserted in the unit tests.

## Data and cleanup

- Snapshot of the database before, restored after; the Bistro dish is cloned from a Halka dish inside the test.

## Test implementation

[packages/app/tests/e2e/profile-editing.e2e.test.ts](../../../packages/app/tests/e2e/profile-editing.e2e.test.ts): `both accounts may edit their own restaurant; refused reads and writes by the other restaurant leave every table as it was, and a foreign id is not found`
