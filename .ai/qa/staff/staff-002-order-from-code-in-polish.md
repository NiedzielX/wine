---
id: staff-002-order-from-code-in-polish
area: staff
title: "Order from code in polish"
status: automated
spec:
  path: .ai/specs/2026-10-16-recommendation-code.md
  ac: ["AC7"]
test:
  file: packages/app/tests/e2e/staff-code.e2e.test.ts
  it: "Polish: the same path with the language kept in every form and redirect"
---

# staff-002-order-from-code-in-polish: Order from code in polish

## Goal

The same code flow works in Polish, with the language kept in every form and redirect.

## Given

1. A fresh code and the Polish language selected.

## When

1. The waiter opens the staff page with the code in Polish and submits "Zamówione".

## Then

1. The section is titled "Zamówienie z kodu" and has a "Zamówione" button.
2. The redirect keeps the language ("lang=pl").
3. The page then shows "Oznaczone o hh:mm" and a "Cofnij" button.
4. The code is stored as confirmed.

## Edge cases covered

- Language is kept through the form and the redirect.

## Data and cleanup

- Plain HTTP requests with a phone user agent, as a browser without JavaScript would send them; no real browser is started.
- Each test first opens a wine page for an active Halka wine in a new guest session to get a fresh code; those code rows stay in the database and are never reused by another test.
- The code stays confirmed afterwards.

## Test implementation

[packages/app/tests/e2e/staff-code.e2e.test.ts](../../../packages/app/tests/e2e/staff-code.e2e.test.ts): `Polish: the same path with the language kept in every form and redirect`

**Notes for the reviewer:** The title does not name an AC; AC7 is the closest from the file comment (the "Ordered"/"Undo" path).
