---
id: staff-007-whole-table-needs-two-dishes
area: staff
title: "Whole table needs two dishes"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-whole-table-waiter-path.md
  ac: ["AC12"]
test:
  file: packages/app/tests/e2e/staff-table.e2e.test.ts
  it: "G11 without dishes or with one dish records nothing and issues no code"
---

# staff-007-whole-table-needs-two-dishes: Whole table needs two dishes

## Goal

The whole-table lookup with no dish or with only one dish records nothing and issues no code.

## Given

1. A fixed waiter session id and the whole-table form.

## When

1. The waiter opens the form with no dishes, then submits it with a single dish.

## Then

1. The page says "Tick at least two dishes."
2. After a wait, no usage event and no code exist for the session.

## Edge cases covered

- Zero dishes and exactly one dish.

## Data and cleanup

- Plain HTTP requests with a phone user agent, as a browser without JavaScript would send them; no real browser is started.
- Uses a fixed session id; nothing is stored.

## Test implementation

[packages/app/tests/e2e/staff-table.e2e.test.ts](../../../packages/app/tests/e2e/staff-table.e2e.test.ts): `G11 without dishes or with one dish records nothing and issues no code`

**Notes for the reviewer:** The test asserts the message for the one-dish case only; the zero-dish page is only opened, its text is not asserted.
