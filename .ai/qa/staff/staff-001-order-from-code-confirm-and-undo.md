---
id: staff-001-order-from-code-confirm-and-undo
area: staff
title: "Order from code confirm and undo"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-recommendation-code.md
  ac: ["AC7","AC8","AC15"]
test:
  file: packages/app/tests/e2e/staff-code.e2e.test.ts
  it: "code of today → wine → \"Ordered\" → a double post keeps the first time → \"Undo\"; no cookie anywhere"
---

# staff-001-order-from-code-confirm-and-undo: Order from code confirm and undo

## Goal

The waiter types a guest’s code, sees the wine, marks it "Ordered", and can undo the mark; a double tap keeps the first time.

## Given

1. A guest has been issued a code for a bottle of an active wine today.

## When

1. The waiter opens the staff page with that code (typed in lower case).
2. The waiter submits the "Ordered" form, submits it a second time, and then submits "Undo".

## Then

1. The staff page loads (200), sets no cookie, and shows the code card with "1 bottle, n ml" and "Code <code>, shown at hh:mm".
2. The form carries only the fields slug, code, intent and session id (plus the technical action id), with intent "confirm".
3. The first post redirects (303) to the page with "marked=confirmed" and sets no cookie; the code is stored as confirmed by "staff_view".
4. A second post keeps the first confirmation time.
5. The page then shows "Marked at hh:mm" and the status message "Marked as ordered."
6. The "Undo" form posts back to "marked=undone" and the code is no longer confirmed.

## Edge cases covered

- Double tap or back button: first time is kept.
- Lower-case code accepted.
- No cookie anywhere on the path.

## Data and cleanup

- Plain HTTP requests with a phone user agent, as a browser without JavaScript would send them; no real browser is started.
- Each test first opens a wine page for an active Halka wine in a new guest session to get a fresh code; those code rows stay in the database and are never reused by another test.
- The code ends unconfirmed again at the end of the test (after "Undo").

## Test implementation

[packages/app/tests/e2e/staff-code.e2e.test.ts](../../../packages/app/tests/e2e/staff-code.e2e.test.ts): `code of today → wine → "Ordered" → a double post keeps the first time → "Undo"; no cookie anywhere`
