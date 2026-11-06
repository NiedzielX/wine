---
id: showcase-002-showcase-off-or-wrong-mode
area: showcase
title: "Showcase is 404 while off, and a wrong mode stops the start"
status: automated
spec:
  path: .ai/specs/2026-11-04-sales-demo-and-roi-calculator.md
  ac: ["AC1", "AC2"]
test:
  file: packages/app/tests/e2e/showcase.e2e.test.ts
  it: "answers 404 on every /demo page while SHOWCASE_MODE is unset, and refuses to start with a wrong value"
---

# showcase-002-showcase-off-or-wrong-mode: Showcase is 404 while off, and a wrong mode stops the start

## Goal

A normal installation shows nothing under /demo, and a typo in the mode never switches the showcase on.

## Given

1. A second app is started with the same database and no showcase mode.

## When

1. Open every /demo address, with and without numbers, and the guest start page.
2. Start an app with the mode misspelt.

## Then

1. Every /demo address answers 404; the guest start page still answers 200.
2. The misspelt app exits with code 1 and its log names the variable and the two allowed values.

## Edge cases covered

- The value "demo" is also refused in this phase (unit test of the configuration).

## Data and cleanup

- Nothing is written. Plain HTTP, no browser; the built app runs with the showcase mode "calculator" (global setup of the e2e run).

## Test implementation

[packages/app/tests/e2e/showcase.e2e.test.ts](../../../packages/app/tests/e2e/showcase.e2e.test.ts): `answers 404 on every /demo page while SHOWCASE_MODE is unset, and refuses to start with a wrong value`
