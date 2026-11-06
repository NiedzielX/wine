---
id: kpi-007-sales-attach-rate-and-revenue-tiles
area: kpi
title: "Sales attach rate and revenue tiles"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-kpi-dashboard.md
  ac: ["AC4","Q3"]
test:
  file: packages/app/tests/e2e/kpi-sales.e2e.test.ts
  it: "AC4 + Q3: the highlighted attach rate with N of M checks and the pp change, the amounts in %, and \"Sales data through\""
---

# kpi-007-sales-attach-rate-and-revenue-tiles: Sales attach rate and revenue tiles

## Goal

The dashboard highlights the wine attach rate with "n of m checks", the change in points, the money tiles and the date the sales data runs through.

## Given

1. Under one confirmed sales import: 30 checks with food in each window, wine on 12 of them in the current window and on 9 in the previous window (150 zł per bottle, 100 zł per food line).

## When

1. The sommelier opens the Halka dashboard.

## Then

1. "Wine attach rate" is 40.0% and the text reads "12 of 30 checks with food".
2. It is up 10.0 pp vs previous 28 days.
3. "Wine revenue per table" is 60 zł, up 33% vs previous 28 days.
4. "Average bottle" is 150 zł.
5. The page shows "Sales data through".
6. The empty-state text is gone and there is one explanation block for the sales indicators.

## Edge cases covered

- Change in percentage points for a rate and in percent for money.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- Inserts one confirmed import job and 81 sales rows straight into the database (business days in both windows); both are deleted at the end of the file. The import itself is not tested here.

## Test implementation

[packages/app/tests/e2e/kpi-sales.e2e.test.ts](../../../packages/app/tests/e2e/kpi-sales.e2e.test.ts): `AC4 + Q3: the highlighted attach rate with N of M checks and the pp change, the amounts in %, and "Sales data through"`
