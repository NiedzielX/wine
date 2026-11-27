---
id: kpi-009-results-report-asks-for-launch-day-and-import
area: kpi
title: "Results report asks for the launch day and the POS export"
status: automated
spec:
  path: .ai/specs/implemented/2026-11-18-owner-proof-report.md
  ac: ["AC10", "AC15"]
test:
  file: packages/app/tests/e2e/proof-report.e2e.test.ts
  it: "A33: without a launch day the screen asks for it, with a day and no sales it asks for a POS export, and the Wine Director and a visitor are refused"
---

# kpi-009-results-report-asks-for-launch-day-and-import: Results report asks for the launch day and the POS export

## Goal

The owner and the general manager are told what is missing before any number is shown, and nobody else reads the report.

## Given

1. Halka has no launch day and no POS sales; the General Manager and the Wine Director of Halka have accounts.

## When

1. The General Manager opens the Results report.
2. A visitor without a session and the Wine Director open the same address.
3. The Wine Director posts the launch day form directly.
4. The General Manager saves a launch day and opens the report again.

## Then

1. The first view says the launch day must be set first and shows the date form.
2. The visitor is sent to sign in; the Wine Director gets 403, also for the report API; the forged post is refused with "forbidden" and no entry is stored.
3. After the save the screen says to upload a POS export and links to the sales import.

## Edge cases covered

- The first entry needs no reason.

## Data and cleanup

- Snapshot of the whole database before, restored after; the sales and launch day rows of Halka are removed at the start.

## Test implementation

[packages/app/tests/e2e/proof-report.e2e.test.ts](../../../packages/app/tests/e2e/proof-report.e2e.test.ts): `A33: without a launch day the screen asks for it, with a day and no sales it asks for a POS export, and the Wine Director and a visitor are refused`
