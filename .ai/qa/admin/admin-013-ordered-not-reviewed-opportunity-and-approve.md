---
id: admin-013-ordered-not-reviewed-opportunity-and-approve
area: admin
title: "Ordered not reviewed opportunity and approve"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-sommelier-opportunities.md
  ac: ["AC12"]
test:
  file: packages/app/tests/e2e/opportunities.e2e.test.ts
  it: "five staff-confirmed codes for a suggested pair give S5 in A14; \"Approve\" posts the version and ends it"
---

# admin-013-ordered-not-reviewed-opportunity-and-approve: Ordered not reviewed opportunity and approve

## Goal

A pairing that waiters confirmed five times by recommendation code but is not approved raises an opportunity, and "Approve" resolves it.

## Given

1. The sommelier is signed in without JavaScript.
2. A published dish has a pairing with status "suggested" (the test looks one up).
3. Five confirmed recommendation codes for that wine and dish are inserted for the last full service day in the window.

## When

1. The sommelier opens the Opportunities inbox and presses "Approve" on that pairing’s opportunity.

## Then

1. Exactly one "ordered, not reviewed" opportunity exists for the pairing.
2. Its text says the wine "was ordered with a recommendation code for this dish 5 times in the last 28 days, and this pairing isn’t approved."
3. The form carries the pairing’s current version number.
4. After "Approve" the browser stays on the inbox, the opportunity disappears, and the pairing has status "approved".

## Edge cases covered

- Threshold of five orders (minimum orders) is met exactly.
- Version number posted with the form.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka (sommelier Marta Wierzbicka, password-protected demo accounts). The test file uses its own browser session, so cookies are not shared with other files.
- Inserts five recommendation-code rows straight into the database and deletes them afterwards.
- The pairing is returned to "suggested" afterwards (reject, then restore as suggestion).

## Test implementation

[packages/app/tests/e2e/opportunities.e2e.test.ts](../../../packages/app/tests/e2e/opportunities.e2e.test.ts): `five staff-confirmed codes for a suggested pair give S5 in A14; "Approve" posts the version and ends it`
