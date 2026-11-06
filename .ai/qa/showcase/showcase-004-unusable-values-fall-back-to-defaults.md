---
id: showcase-004-unusable-values-fall-back-to-defaults
area: showcase
title: "Unusable values fall back to the defaults and are named"
status: automated
spec:
  path: .ai/specs/2026-11-04-sales-demo-and-roi-calculator.md
  ac: ["AC5", "AC7"]
test:
  file: packages/app/tests/e2e/showcase.e2e.test.ts
  it: "falls back to the defaults for unusable values and names them, and never shows NaN or Infinity"
---

# showcase-004-unusable-values-fall-back-to-defaults: Unusable values fall back to the defaults and are named

## Goal

A link with garbage in it never breaks the page.

## Given

1. None.

## When

1. Open the calculator with an exponent, a negative margin, text, an empty value, a repeated value and a __proto__ key.
2. Open the summary with a negative number and a bad date.

## Then

1. The page answers 200, says which values were replaced and shows the default result 9,110 zł.
2. No NaN, Infinity, undefined or [object appears.
3. The summary shows the date as not set.

## Edge cases covered

- Only what is listed under Then.

## Data and cleanup

- Nothing is written. Plain HTTP, no browser; the built app runs with the showcase mode "calculator" (global setup of the e2e run).

## Test implementation

[packages/app/tests/e2e/showcase.e2e.test.ts](../../../packages/app/tests/e2e/showcase.e2e.test.ts): `falls back to the defaults for unusable values and names them, and never shows NaN or Infinity`
