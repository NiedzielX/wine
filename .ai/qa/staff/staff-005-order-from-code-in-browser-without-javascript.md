---
id: staff-005-order-from-code-in-browser-without-javascript
area: staff
title: "Order from code in browser without javascript"
status: automated
spec:
  path: .ai/specs/2026-10-16-recommendation-code.md
  ac: ["AC7"]
test:
  file: packages/app/tests/e2e/staff-code.e2e.test.ts
  it: "type the code, Find, Ordered, Undo — native forms only, no sideways scroll"
---

# staff-005-order-from-code-in-browser-without-javascript: Order from code in browser without javascript

## Goal

In a real phone-sized browser with no script, the waiter types a code, presses Find, Ordered and Undo using native forms only, without sideways scroll at 390 px and 1440 px.

## Given

1. A fresh code; a browser with all script requests aborted at 390 px width.

## When

1. The waiter opens the staff page, types the code (lower case, with spaces) and presses "Find", then "Ordered".
2. The window is widened to 1440 px, the page reloaded and "Undo" pressed.

## Then

1. No client script runs.
2. After "Find" the page shows "Code <code>, shown at" and is not wider than the window.
3. After "Ordered" it shows "Marked as ordered." and the code is stored confirmed.
4. At 1440 px the page shows "Marked at" and is not wider than the window.
5. After "Undo" it shows "Mark removed." and the code is no longer confirmed.

## Edge cases covered

- Spaces and lower case around the typed code.
- Two viewport widths: 390 px and 1440 px.
- Page replaced by each native form post.

## Data and cleanup

- All script requests of the browser session are aborted before the first page, so the page is checked as plain HTML.
- Each test first opens a wine page for an active Halka wine in a new guest session to get a fresh code; those code rows stay in the database and are never reused by another test.
- The code ends unconfirmed after "Undo".

## Test implementation

[packages/app/tests/e2e/staff-code.e2e.test.ts](../../../packages/app/tests/e2e/staff-code.e2e.test.ts): `type the code, Find, Ordered, Undo — native forms only, no sideways scroll`
