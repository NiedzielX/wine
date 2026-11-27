---
id: kpi-010-results-report-shows-before-after-and-verdict
area: kpi
title: "Results report shows before, after and the verdict"
status: automated
spec:
  path: .ai/specs/implemented/2026-11-18-owner-proof-report.md
  ac: ["AC13"]
test:
  file: packages/app/tests/e2e/proof-report.e2e.test.ts
  it: "A33: window 1 shows 35 percent before, 50 percent after, the change with an outward interval and the verdict, and no check id, code or session id"
---

# kpi-010-results-report-shows-before-after-and-verdict: Results report shows before, after and the verdict

## Goal

The owner sees the share of checks with wine before and after the launch, how sure the report is, and nothing about a single check.

## Given

1. Halka has a launch day and POS lines: 42 of 120 checks with food had wine in the baseline, 65 of 130 in window 1; some wine lines carry a recommendation code.

## When

1. The General Manager opens window 1 and reads the same window from the API.

## Then

1. The screen shows 35% (42 of 120) before and 50% (65 of 130) after, "+15 percentage points, interval from +2 to +27" (the interval rounded outward) and the sentence that the share is higher and that the report does not say what caused it.
2. The window table lists the baseline and window 1 with their intervals.
3. No check id, no recommendation code and no session id appears in the page; the API answers with the same counts.

## Edge cases covered

- The numbers are those of case H2 of the specification.

## Data and cleanup

- Snapshot restored after; POS lines inserted with SQL.

## Test implementation

[packages/app/tests/e2e/proof-report.e2e.test.ts](../../../packages/app/tests/e2e/proof-report.e2e.test.ts): `A33: window 1 shows 35 percent before, 50 percent after, the change with an outward interval and the verdict, and no check id, code or session id`
