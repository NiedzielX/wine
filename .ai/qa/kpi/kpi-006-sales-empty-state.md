---
id: kpi-006-sales-empty-state
area: kpi
title: "Sales empty state"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-kpi-dashboard.md
  ac: ["AC5"]
test:
  file: packages/app/tests/e2e/kpi-sales.e2e.test.ts
  it: "AC5: without POS sales in the window, the empty state with \"Import sales\" — not zeros"
---

# kpi-006-sales-empty-state: Sales empty state

## Goal

Without POS sales in the window the dashboard shows an empty state with an "Import sales" link, not zeros.

## Given

1. The sommelier is signed in; no sales exist in the window.

## When

1. The sommelier opens the Halka dashboard.

## Then

1. The page shows "Upload a POS export to see attach rate" under "Sales".
2. It does not show "checks with food".
3. It links to the sales import page (/admin/halka/import/sales).

## Edge cases covered

- Empty state instead of zero values.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- Runs before the numbers test inserts sales.
- Read-only: the test changes no data.

## Test implementation

[packages/app/tests/e2e/kpi-sales.e2e.test.ts](../../../packages/app/tests/e2e/kpi-sales.e2e.test.ts): `AC5: without POS sales in the window, the empty state with "Import sales" — not zeros`
