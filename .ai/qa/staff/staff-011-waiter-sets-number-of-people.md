---
id: staff-011-waiter-sets-number-of-people
area: staff
title: "Waiter sets number of people"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-whole-table-waiter-path.md
  ac: ["R16","AC19"]
test:
  file: packages/app/tests/e2e/table-quantity.e2e.test.ts
  it: "1440 px, G11: the waiter taps \"4\" under the bottle — the amount, no sideways scroll"
---

# staff-011-waiter-sets-number-of-people: Waiter sets number of people

## Goal

On the waiter’s whole-table screen no amount is shown until the waiter taps the number of people, and one tap on "4" shows the amount.

## Given

1. A script-free browser at 1440 px width on the waiter whole-table screen with six dishes.

## When

1. The waiter taps "4" people under the bottle.

## Then

1. Before the tap the page shows the bottle "No. 109 Radikon Slatnik." and no amount.
2. After the tap it shows "For 4 people:" and still the same bottle.
3. The page is not wider than the window.

## Edge cases covered

- No quantity before a choice (owner decision Q4).

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- Continues the browser session of the previous test but starts a new page. The bottle name depends on the seed data.

## Test implementation

[packages/app/tests/e2e/table-quantity.e2e.test.ts](../../../packages/app/tests/e2e/table-quantity.e2e.test.ts): `1440 px, G11: the waiter taps "4" under the bottle — the amount, no sideways scroll`

**Notes for the reviewer:** The test hard-codes the recommended bottle name from the seed, so changing demo data or engine rules can break it.
