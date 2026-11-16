---
id: guest-017-demo-start-on-memory-hides-calculator
area: guest
title: "Demo start page on a memory instance hides the calculator"
status: automated
spec:
  path: .ai/specs/2026-11-16-interactive-demo-entry.md
  ac: ["AC2", "AC7"]
test:
  file: packages/app/tests/e2e/demo-entry.e2e.test.ts
  it: "on a memory instance without SHOWCASE_MODE the page works too, hides the calculator and answers 404 for its address"
---

# guest-017-demo-start-on-memory-hides-calculator: Demo start page on a memory instance hides the calculator

## Goal

The start page also works on an in-memory demo instance, and shows no link to a calculator that is switched off.

## Given

1. An instance on in-memory data with `ALLOW_DEMO_DATA=true` and no `SHOWCASE_MODE`.

## When

1. A visitor opens `/start?lang=en`, follows the guest and waiter links, opens `/demo/roi`, and signs in as Marta from the page.

## Then

1. `/start` answers 200 and has no link under `/demo`; `/demo/roi` answers 404.
2. Every guest and waiter link answers 200.
3. The dashboard buttons are Marta and Tomasz, and "Sign in as Marta" answers 303 to `/admin/halka` with a session cookie.

## Edge cases covered

- In-memory data instead of PostgreSQL; the calculator mode `off`.

## Data and cleanup

- Starts one extra built instance with in-memory data; nothing persistent is written.

## Test implementation

[packages/app/tests/e2e/demo-entry.e2e.test.ts](../../../packages/app/tests/e2e/demo-entry.e2e.test.ts): `on a memory instance without SHOWCASE_MODE the page works too, hides the calculator and answers 404 for its address`
