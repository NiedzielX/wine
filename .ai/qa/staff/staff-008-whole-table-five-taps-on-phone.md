---
id: staff-008-whole-table-five-taps-on-phone
area: staff
title: "Whole table five taps on phone"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-whole-table-waiter-path.md
  ac: ["AC7"]
test:
  file: packages/app/tests/e2e/staff-table.e2e.test.ts
  it: "390 px: tick four tiles and press \"Show the bottle\" — the answer, from the form alone"
---

# staff-008-whole-table-five-taps-on-phone: Whole table five taps on phone

## Goal

On a 390 px phone with no script, the waiter ticks four dish tiles and presses "Show the bottle" to get the answer from the form alone, with tiles tall enough to tap.

## Given

1. A script-free browser at 390 px width on the whole-table staff form.

## When

1. The waiter taps the tiles Beef tartare, Wild mushroom risotto, Duck breast and Pike-perch and presses "Show the bottle".

## Then

1. No client script runs and there is no search box.
2. Every dish tile is at least 48 px high.
3. The page is not wider than the window, before and after the answer.
4. Four dishes are ticked before submitting.
5. The answer shows "This bottle:" and "Works with all 4 dishes."
6. There is one explanation block for the staff table and at most two alternatives.

## Edge cases covered

- Tile height of at least 48 px.
- Five taps in total (four tiles and the button).
- No sideways scroll at 390 px.

## Data and cleanup

- All script requests of the browser session are aborted before the first page, so the page is checked as plain HTML.
- Writes one lookup event and code under the page’s own session id; they are not deleted.

## Test implementation

[packages/app/tests/e2e/staff-table.e2e.test.ts](../../../packages/app/tests/e2e/staff-table.e2e.test.ts): `390 px: tick four tiles and press "Show the bottle" — the answer, from the form alone`
