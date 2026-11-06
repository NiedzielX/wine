---
id: usage-007-table-selection-records-context-table
area: usage
title: "Table selection records context table"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-guest-usage-events.md
  ac: ["AC9"]
test:
  file: packages/app/tests/e2e/usage-events.e2e.test.ts
  it: "table result → bottle → select: wine_selected with context table and the table dishes (AC9)"
---

# usage-007-table-selection-records-context-table: Table selection records context table

## Goal

Choosing a bottle from the whole-table result records the selection with context "table" and the table’s dishes.

## Given

1. A guest session (no JavaScript) with the table page; the first two dishes of the form are chosen.

## When

1. The guest opens the table result, opens the first bottle and submits "Choose this wine" for a bottle.

## Then

1. The stored events are, in order: session started, table recommendation viewed, wine viewed, wine selected.
2. The table recommendation event lists the two dishes and its first wine is the bottle opened.
3. The selection has no single dish, the bottle’s wine, serving "bottle", context "table" and the two dishes.

## Edge cases covered

- Selection without a single dish id; dishes listed instead.

## Data and cleanup

- Plain HTTP requests with a phone user agent, as a browser without JavaScript would send them; no real browser is started.
- Uses fixed or freshly generated session ids; the rows it causes are written under those ids and not deleted.

## Test implementation

[packages/app/tests/e2e/usage-events.e2e.test.ts](../../../packages/app/tests/e2e/usage-events.e2e.test.ts): `table result → bottle → select: wine_selected with context table and the table dishes (AC9)`
