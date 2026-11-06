---
id: showcase-001-calculator-and-summary-open-later-pages-404
area: showcase
title: "Calculator and summary open, pages of later phases are 404"
status: automated
spec:
  path: .ai/specs/2026-11-04-sales-demo-and-roi-calculator.md
  ac: ["AC2"]
test:
  file: packages/app/tests/e2e/showcase.e2e.test.ts
  it: "serves the calculator and the summary, and answers 404 for the pages of the later phases"
---

# showcase-001-calculator-and-summary-open-later-pages-404: Calculator and summary open, pages of later phases are 404

## Goal

In calculator mode the owner-facing calculator and its printable summary open; the pages that belong to later phases do not exist yet.

## Given

1. The app runs with the showcase mode "calculator".

## When

1. Open the calculator, then the printable summary.
2. Open /demo, /demo/panel and /demo/kpi.

## Then

1. The calculator and the summary answer 200.
2. The three other addresses answer 404.

## Edge cases covered

- Only the pages of this phase are checked; the guided demo, the panel and the KPI pages are later phases.

## Data and cleanup

- Nothing is written. Plain HTTP, no browser; the built app runs with the showcase mode "calculator" (global setup of the e2e run).

## Test implementation

[packages/app/tests/e2e/showcase.e2e.test.ts](../../../packages/app/tests/e2e/showcase.e2e.test.ts): `serves the calculator and the summary, and answers 404 for the pages of the later phases`
