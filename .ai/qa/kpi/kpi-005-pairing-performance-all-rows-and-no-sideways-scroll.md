---
id: kpi-005-pairing-performance-all-rows-and-no-sideways-scroll
area: kpi
title: "Pairing performance all rows and no sideways scroll"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-kpi-dashboard.md
  ac: ["AC12"]
test:
  file: packages/app/tests/e2e/kpi-pairings.e2e.test.ts
  it: "?pairs=all shows every row; AC12: no horizontal page scroll at 390 px and 1440 px with long names"
---

# kpi-005-pairing-performance-all-rows-and-no-sideways-scroll: Pairing performance all rows and no sideways scroll

## Goal

The "show all" view lists every pairing, and neither the top-10 view nor the full view scrolls sideways with long names.

## Given

1. The long dish and wine names of the previous test are still in place.

## When

1. The sommelier opens the dashboard and the dashboard with "all pairings" at 390 px and at 1440 px width.

## Then

1. In every combination the page is not wider than the window.
2. The full view has more than 10 rows.
3. The page links back to the top-10 view.

## Edge cases covered

- Two views times two widths with the long names.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- The test continues the browser session of the earlier tests in the same file (the page it starts on is the one the previous test left), so it is not meant to run alone.

## Test implementation

[packages/app/tests/e2e/kpi-pairings.e2e.test.ts](../../../packages/app/tests/e2e/kpi-pairings.e2e.test.ts): `?pairs=all shows every row; AC12: no horizontal page scroll at 390 px and 1440 px with long names`
