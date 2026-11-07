---
id: showcase-010-demo-codes-and-public-actions
area: showcase
title: "The demo still issues recommendation codes; guest pages stay cookie-free"
status: automated
spec:
  path: .ai/specs/2026-11-04-sales-demo-and-roi-calculator.md
  ac: ["AC13"]
test:
  file: packages/app/tests/e2e/showcase.e2e.test.ts
  it: "still issues recommendation codes and lets the waiter confirm one, while every guest page stays cookie-free"
---

# showcase-010-demo-codes-and-public-actions: The demo still issues recommendation codes; guest pages stay cookie-free

## Goal

On the demo instance the guest's path to the waiter works end to end: a code appears on the selected-wine page and the waiter can confirm it. This is the one write the demo keeps (in process memory), and guest pages never set a cookie.

## Given

1. An instance runs in demo mode.

## When

1. Open the guide, then the dish page, the landing page, the menu, the whole-table page, the waiter's table page, the explainer and a wine page, with a phone's user agent.
2. Choose the wine (bottle) for the dish and read the page.
3. Open the waiter's lookup for that code and send the "Ordered" form action; then send it for an unknown code.

## Then

1. Every page answers 200, sets no cookie and says "do not index" (on the main instance the same pages do not).
2. The selected-wine page shows a code (not "Code unavailable") and sets no cookie.
3. The waiter's action redirects back with `marked=confirmed`, and with `codeError=not_found` for the unknown code; neither sets a cookie.

## Edge cases covered

- A request without a phone-like user agent is not a guest and gets no code, as on every instance.
- Guest usage events are switched off in demo mode: unit test (`showcase-demo.test.ts`), not observable in e2e.

## Data and cleanup

- The only write is the code held in process memory; the instance is started by the test and stopped at the end.

## Test implementation

[packages/app/tests/e2e/showcase.e2e.test.ts](../../../packages/app/tests/e2e/showcase.e2e.test.ts): `still issues recommendation codes and lets the waiter confirm one, while every guest page stays cookie-free`
