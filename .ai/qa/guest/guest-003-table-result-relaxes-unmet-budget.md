---
id: guest-003-table-result-relaxes-unmet-budget
area: guest
title: "Table result relaxes unmet budget"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-whole-table-waiter-path.md
  ac: ["AC15"]
test:
  file: packages/app/tests/e2e/home.e2e.test.ts
  it: "the table result relaxes a budget no bottle meets: a notice and the closest bottles, with \"n of m\" (whole-table spec, AC15)"
---

# guest-003-table-result-relaxes-unmet-budget: Table result relaxes unmet budget

## Goal

When no bottle meets the budget the table result says so and shows the closest bottles instead of an empty page.

## Given

1. The guest picks four dishes (Beef tartare, Wild mushroom risotto, Duck breast, Pike-perch) with red wine only and a maximum price of 200 zł.

## When

1. The guest opens the whole-table result for that selection.

## Then

1. The page shows the notice "Nothing matches under 200 zł".
2. The page does not say "No bottle fits these filters".
3. Bottles are shown with a "Works with" or "Not a strong match" label.
4. The page has exactly one explanation block for the table result.

## Edge cases covered

- Budget too low for any bottle: the budget is relaxed and the guest is told.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- Reads the dish ids from the public menu API; no data is written.

## Test implementation

[packages/app/tests/e2e/home.e2e.test.ts](../../../packages/app/tests/e2e/home.e2e.test.ts): `the table result relaxes a budget no bottle meets: a notice and the closest bottles, with "n of m" (whole-table spec, AC15)`

**Notes for the reviewer:** The test name mentions an "n of m" count, but the test does not assert it. Only the notice, the labels and the explanation block are checked.
