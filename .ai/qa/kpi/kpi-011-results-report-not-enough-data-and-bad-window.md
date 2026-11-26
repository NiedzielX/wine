---
id: kpi-011-results-report-not-enough-data-and-bad-window
area: kpi
title: "Results report: not enough data and a window that does not exist"
status: automated
spec:
  path: .ai/specs/2026-11-18-owner-proof-report.md
  ac: ["AC4"]
test:
  file: packages/app/tests/e2e/proof-report.e2e.test.ts
  it: "A33: a window without data of its own shows the counters and the reason with what to do, and no change or verdict; a window that does not exist is an error message"
---

# kpi-011-results-report-not-enough-data-and-bad-window: Results report: not enough data and a window that does not exist

## Goal

When a period has too little data the report says so and what to do, and a window outside 1 to 12 is explained, not a crash.

## Given

1. Halka has a launch day and POS data only up to the end of window 1.

## When

1. The General Manager opens window 2.
2. The General Manager opens windows 0, 13, 1e9 and abc.

## Then

1. Window 2 shows the counters, "Not enough data to show a change", the reason that the POS data ends before the end of the window and what to upload, and no change, interval or verdict.
2. Each bad window shows "This window does not exist" with a link to the newest window.

## Edge cases covered

- Windows 0, 13, 1e9 and abc.

## Data and cleanup

- Uses the data of the previous scenario in the same file.

## Test implementation

[packages/app/tests/e2e/proof-report.e2e.test.ts](../../../packages/app/tests/e2e/proof-report.e2e.test.ts): `A33: a window without data of its own shows the counters and the reason with what to do, and no change or verdict; a window that does not exist is an error message`
