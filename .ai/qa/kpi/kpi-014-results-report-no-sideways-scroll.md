---
id: kpi-014-results-report-no-sideways-scroll
area: kpi
title: "Results report: no sideways scroll"
status: automated
spec:
  path: .ai/specs/2026-11-18-owner-proof-report.md
  ac: ["AC14"]
test:
  file: packages/app/tests/e2e/proof-report-layout.e2e.test.ts
  it: "AC14: no horizontal page scroll at 390 px and 1440 px with the result, with not enough data and with the error message"
---

# kpi-014-results-report-no-sideways-scroll: Results report: no sideways scroll

## Goal

The Results report fits the page width on a phone and on a desktop in every state.

## Given

1. The General Manager is signed in; Halka has a launch day and POS lines.

## When

1. The General Manager opens window 1, window 2 and window 99 at 390 px and at 1440 px width.

## Then

1. At both widths and for each of the three windows the page is not wider than the window.

## Edge cases covered

- Two viewport widths and three states (result, not enough data, error).

## Data and cleanup

- Snapshot restored after.

## Test implementation

[packages/app/tests/e2e/proof-report-layout.e2e.test.ts](../../../packages/app/tests/e2e/proof-report-layout.e2e.test.ts): `AC14: no horizontal page scroll at 390 px and 1440 px with the result, with not enough data and with the error message`
