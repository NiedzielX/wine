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

1. The answer of the previous test is on screen.

## When

1. The window is widened to 1440 px and the page reloaded.

## Then

1. The page still shows "This bottle:".
2. The page is not wider than the window.

## Edge cases covered

- Desktop width 1440 px.

## Data and cleanup

- All script requests of the browser session are aborted before the first page, so the page is checked as plain HTML.
- The test continues the browser session of the earlier tests in the same file, so it is not meant to run alone.

## Test implementation

[packages/app/tests/e2e/staff-table.e2e.test.ts](../../../packages/app/tests/e2e/staff-table.e2e.test.ts): `1440 px: the same answer in the 720 px column, no sideways scroll`

**Notes for the reviewer:** The title mentions a "720 px column", but the test does not measure it; it checks only the answer text and no sideways scroll.
