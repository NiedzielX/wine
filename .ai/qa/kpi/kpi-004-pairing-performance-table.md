---
id: kpi-004-pairing-performance-table
area: kpi
title: "Pairing performance table"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-kpi-dashboard.md
  ac: ["AC7","AC8"]
test:
  file: packages/app/tests/e2e/kpi-pairings.e2e.test.ts
  it: "AC7 + AC8: seen pairings lead with shown, chosen, conversion and their source then; approved ones without views read \"No views\""
---

# kpi-004-pairing-performance-table: Pairing performance table

## Goal

The pairing performance table leads with pairings guests actually saw, showing shown, chosen, conversion and source, and lists approved pairings without views as "No views".

## Given

1. An approved pairing of a published dish with an active wine; the dish and wine renamed to very long names.
2. 12 views of that pairing as the sommelier’s primary with 3 chosen, 5 views of another wine suggested by the engine with 1 chosen, and 9 older views in the previous window.

## When

1. The sommelier opens the Halka dashboard.

## Then

1. The page shows "Pairing performance" with a "Dish" column.
2. The table has 10 rows.
3. The first row is the sommelier pairing with the long dish and wine names, source "Sommelier", 12 shown, 3 chosen, 25.0%.
4. The second row is the engine pairing with 5 shown, 1 chosen, 20.0%.
5. The remaining rows read "No views".
6. The dish links to its pairing page.
7. A link "Show all n pairings" is offered.

## Edge cases covered

- Long dish and wine names.
- Previous-window views are not in the table.
- Ordering: seen pairings first, then approved ones without views.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- The rows are placed in the current KPI window (the app itself only records "now", which lies outside the window) and are removed at the end of the file.
- Renames one dish and one wine for the check; the original names are restored at the end of the file. Events carry the engine version "wm-e2e-e04-f3".

## Test implementation

[packages/app/tests/e2e/kpi-pairings.e2e.test.ts](../../../packages/app/tests/e2e/kpi-pairings.e2e.test.ts): `AC7 + AC8: seen pairings lead with shown, chosen, conversion and their source then; approved ones without views read "No views"`
