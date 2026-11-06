---
id: showcase-003-link-carries-numbers-form-works-without-script
area: showcase
title: "The link carries the numbers and the form works without a script"
status: automated
spec:
  path: .ai/specs/2026-11-04-sales-demo-and-roi-calculator.md
  ac: ["AC7"]
test:
  file: packages/app/tests/e2e/showcase.e2e.test.ts
  it: "keeps the numbers in the address: the same link gives the same figures, and a form sent without JavaScript changes the result"
---

# showcase-003-link-carries-numbers-form-works-without-script: The link carries the numbers and the form works without a script

## Goal

The owner can send a link with their own numbers, and the form works with no JavaScript at all.

## Given

1. The calculator is open in English.

## When

1. Open an address with all seven numbers twice.
2. Read the form of the default page, change the number of guests and send it as a plain GET.

## Then

1. Both openings give identical pages, a negative result with its explanation and the substituted formula.
2. The form has method get, seven fields and a label for each.
3. With 3 000 guests the result is 19,010 zł instead of 9,110 zł.

## Edge cases covered

- No browser: the test builds the form address from the form fields. Focus and keyboard behaviour is not covered.

## Data and cleanup

- Nothing is written. Plain HTTP, no browser; the built app runs with the showcase mode "calculator" (global setup of the e2e run).

## Test implementation

[packages/app/tests/e2e/showcase.e2e.test.ts](../../../packages/app/tests/e2e/showcase.e2e.test.ts): `keeps the numbers in the address: the same link gives the same figures, and a form sent without JavaScript changes the result`
