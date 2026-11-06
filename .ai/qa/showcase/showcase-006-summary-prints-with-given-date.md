---
id: showcase-006-summary-prints-with-given-date
area: showcase
title: "The summary prints with the date that was given"
status: automated
spec:
  path: .ai/specs/2026-11-04-sales-demo-and-roi-calculator.md
  ac: ["AC8"]
test:
  file: packages/app/tests/e2e/showcase.e2e.test.ts
  it: "prints through the browser’s own print path: the summary carries the print rules and the date given, not the clock’s"
---

# showcase-006-summary-prints-with-given-date: The summary prints with the date that was given

## Goal

The printable summary hides what does not belong on paper and shows the date the person typed.

## Given

1. None.

## When

1. Open the summary with a date in the address.

## Then

1. The date is shown as 17/05/2031 in English.
2. There is no print button without a script, and the Ctrl/Cmd+P sentence is there.
3. The header has the hide-on-paper class and the stylesheet hides it in print and sets the A4 page.

## Edge cases covered

- The print emulation and the page count (at most two A4 pages) are NOT checked here: no browser. They need a person or a browser test.

## Data and cleanup

- Nothing is written. Plain HTTP, no browser; the built app runs with the showcase mode "calculator" (global setup of the e2e run).

## Test implementation

[packages/app/tests/e2e/showcase.e2e.test.ts](../../../packages/app/tests/e2e/showcase.e2e.test.ts): `prints through the browser’s own print path: the summary carries the print rules and the date given, not the clock’s`
