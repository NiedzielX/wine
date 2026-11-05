---
id: staff-006-whole-table-lookup-records-event-and-code
area: staff
title: "Whole table lookup records event and code"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-whole-table-waiter-path.md
  ac: ["AC12"]
test:
  file: packages/app/tests/e2e/staff-table.e2e.test.ts
  it: "G9 → \"Whole table\" → the form GET with four dishes: one staff_table_lookup and one staff code, no guest session"
---

# staff-006-whole-table-lookup-records-event-and-code: Whole table lookup records event and code

## Goal

A waiter’s whole-table lookup with four dishes records one lookup event and one staff code, without a guest session, and "Choose this one" swaps the bottle with its own code.

## Given

1. The waiter opens the staff page and follows the "Whole table" link.
2. The form lists dishes; the first four are ticked and the default budget is used.

## When

1. The waiter submits the form as a GET.
2. The waiter follows the "Choose this one" link of an alternative bottle.

## Then

1. The answer loads (200), sets no cookie and shows "This bottle:" with "Works with" or "Not a strong match".
2. Exactly one "staff table lookup" event is stored for the session, with source staff, the four dishes and no budget relaxation, and the first recommended wine as its wine.
3. Exactly one code is stored: source staff, context table, the same wine, and it is shown on the page.
4. After "Choose this one" the page again shows "This bottle:", a second lookup event names the picked wine, and a second code for it is stored.
5. No "guest session started" event appears.

## Edge cases covered

- Staff events are separate from guest sessions.
- A pick of an alternative issues its own code.

## Data and cleanup

- Plain HTTP requests with a phone user agent, as a browser without JavaScript would send them; no real browser is started.
- The write happens after the response, so the test waits (polls) for the rows.
- Uses fixed or freshly generated session ids; the rows it causes are written under those ids and not deleted.

## Test implementation

[packages/app/tests/e2e/staff-table.e2e.test.ts](../../../packages/app/tests/e2e/staff-table.e2e.test.ts): `G9 → "Whole table" → the form GET with four dishes: one staff_table_lookup and one staff code, no guest session`

**Notes for the reviewer:** The spec cites E09 Q19 as a question number, not an AC.
