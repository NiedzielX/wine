---
id: staff-009-whole-table-answer-in-desktop-column
area: staff
title: "Whole table answer in desktop column"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-whole-table-waiter-path.md
  ac: ["AC7"]
test:
  file: packages/app/tests/e2e/staff-table.e2e.test.ts
  it: "1440 px: the same answer in the 720 px column, no sideways scroll"
---

# staff-009-whole-table-answer-in-desktop-column: Whole table answer in desktop column

## Goal

The same whole-table answer fits a desktop window without sideways scroll.

## Given

1. A script-free browser and four dishes in the link (the test opens the page itself; it does not depend on an earlier test).

## When

1. The window is widened to 1440 px and the page is opened.

## Then

1. The page shows "This bottle:" and "Works with all 4 dishes."
2. The page is not wider than the window.
3. The main column is at most 720 px wide.

## Edge cases covered

- Desktop width 1440 px.

## Data and cleanup

- All script requests of the browser session are aborted before the first page, so the page is checked as plain HTML.

## Test implementation

[packages/app/tests/e2e/staff-table.e2e.test.ts](../../../packages/app/tests/e2e/staff-table.e2e.test.ts): `1440 px: the same answer in the 720 px column, no sideways scroll`

