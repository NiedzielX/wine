---
id: guest-011-choose-wine-shows-recommendation-code
area: guest
title: "Choose wine shows recommendation code"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-recommendation-code.md
  ac: ["AC5","AC6","AC14"]
test:
  file: packages/app/tests/e2e/recommendation-code.e2e.test.ts
  it: "dish → wine → \"Choose this wine\": G8 shows a code, stores one row, keeps the code on refresh"
---

# guest-011-choose-wine-shows-recommendation-code: Choose wine shows recommendation code

## Goal

Choosing a wine for a dish shows the guest a short recommendation code for the waiter, which is stored once and stays the same on refresh.

## Given

1. A guest session (no JavaScript) walks from the menu to a dish, to a wine and presses "Choose this wine" for a bottle.

## When

1. The guest sees the "choose" result and then opens the same address again.

## Then

1. The page loads (200) and shows "Code for your waiter" with a three-character code from the allowed alphabet.
2. The response is marked "no-store" and sets no cookie.
3. Exactly one code row is stored for the session: same code, source guest, context dish, the dish, serving bottle, with a menu version.
4. Opening the same address again shows the same code and still only one stored row.

## Edge cases covered

- Code is never cached by a proxy or CDN (AC14).
- Refresh does not issue a second code.

## Data and cleanup

- Plain HTTP requests with a phone user agent, as a browser without JavaScript would send them; no real browser is started.
- Uses the session id that the menu page hands out; the stored code row is not deleted.

## Test implementation

[packages/app/tests/e2e/recommendation-code.e2e.test.ts](../../../packages/app/tests/e2e/recommendation-code.e2e.test.ts): `dish → wine → "Choose this wine": G8 shows a code, stores one row, keeps the code on refresh`
