---
id: kpi-015-results-report-printable-version
area: kpi
title: "Results report: printable version"
status: automated
spec:
  path: .ai/specs/2026-11-18-owner-proof-report.md
  ac: ["AC16"]
test:
  file: packages/app/tests/e2e/proof-report.e2e.test.ts
  it: "A34: the printable page has the report without controls, the Ctrl/Cmd+P line and nothing from outside, and the Wine Director is refused"
---

# kpi-015-results-report-printable-version: Results report: printable version

## Goal

The owner can print the Results report or save it as a PDF and show it to a partner: the same numbers and caveats as on the screen, without the dashboard around them.

## Given

1. Halka has a launch day and POS lines (42 of 120 checks with food had wine in the baseline, 65 of 130 in window 1).
2. The General Manager and the Wine Director of Halka have accounts.

## When

1. The General Manager opens the printable page of window 1.
2. The Wine Director and a visitor without a session open the same address.

## Then

1. The page shows the report of window 1 with 35% before, 50% after, the change with its interval, the comparison caveat and "How we calculate", and "POS data through" with the date of the data, not of the server clock.
2. The line "To print or save as PDF, use Ctrl/Cmd+P" is on the page; without a script there is no print button and no form; the controls are marked as hidden on paper; nothing is loaded from an outside address.
3. No check id, no recommendation code and no session id appears.
4. The Wine Director gets 403 and the visitor is sent to sign in.

## Edge cases covered

- The print button exists only with a script (server-rendered page has none).

## Data and cleanup

- Uses the data of the earlier scenarios of the same file; the database is restored at the end of the file.

## Test implementation

[packages/app/tests/e2e/proof-report.e2e.test.ts](../../../packages/app/tests/e2e/proof-report.e2e.test.ts): `A34: the printable page has the report without controls, the Ctrl/Cmd+P line and nothing from outside, and the Wine Director is refused`

**Notes for the reviewer:** the paper layout itself (navigation hidden, at most two A4 pages, no outside requests) was checked in a browser with print emulation and recorded in the run log; the automated test covers what the server sends.
