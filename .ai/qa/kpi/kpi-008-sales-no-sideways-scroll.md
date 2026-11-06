---
id: kpi-008-sales-no-sideways-scroll
area: kpi
title: "Sales no sideways scroll"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-kpi-dashboard.md
  ac: ["AC12"]
test:
  file: packages/app/tests/e2e/kpi-sales.e2e.test.ts
  it: "AC12: no horizontal page scroll at 390 px and 1440 px with the sales tiles"
---

# kpi-008-sales-no-sideways-scroll: Sales no sideways scroll

## Goal

The sales tiles fit the page width on a phone and on a desktop.

## Given

1. The sommelier is signed in and sales data is present.

## When

1. The sommelier opens the dashboard at 390 px and at 1440 px width.

## Then

1. At both widths the page is not wider than the window (no horizontal scroll).

## Edge cases covered

- Two viewport widths: 390 px and 1440 px.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- The test continues the browser session of the earlier tests in the same file (the page it starts on is the one the previous test left), so it is not meant to run alone.

## Test implementation

[packages/app/tests/e2e/kpi-sales.e2e.test.ts](../../../packages/app/tests/e2e/kpi-sales.e2e.test.ts): `AC12: no horizontal page scroll at 390 px and 1440 px with the sales tiles`
