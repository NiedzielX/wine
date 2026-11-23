---
id: kpi-012-results-report-code-groups-caveat-and-wording
area: kpi
title: "Results report: codes are a comparison, in both languages, without forbidden words"
status: automated
spec:
  path: .ai/specs/2026-11-18-owner-proof-report.md
  ac: ["AC7", "AC9"]
test:
  file: packages/app/tests/e2e/proof-report.e2e.test.ts
  it: "A33: the checks with and without a code carry the caveat in both languages, no difference between the groups, and none of the forbidden words"
---

# kpi-012-results-report-code-groups-caveat-and-wording: Results report: codes are a comparison, in both languages, without forbidden words

## Goal

The comparison of checks with and without a code is never presented as a cause, and the wording of the screen stays within the rules.

## Given

1. The data of the previous scenarios (13 checks with a code in window 1).

## When

1. The General Manager opens window 1 in English and in Polish, and the other states of the screen.

## Then

1. Above the groups table stands the caveat "This is a comparison, not proof of a cause" (Polish: "To zestawienie, nie dowód przyczyny"); the group with a code shows "not enough data" instead of a percentage; the other group shows its share.
2. The page has the "How we calculate" and "What this report does not say" blocks in both languages.
3. No text of any state contains "AI", "guaranteed" (Polish: "gwarantowane"), "dzięki Wine Match" or "efekt Wine Match", and nothing compares the two groups.

## Edge cases covered

- Window 2, an invalid window and the default window in English.

## Data and cleanup

- Uses the data of the previous scenarios.

## Test implementation

[packages/app/tests/e2e/proof-report.e2e.test.ts](../../../packages/app/tests/e2e/proof-report.e2e.test.ts): `A33: the checks with and without a code carry the caveat in both languages, no difference between the groups, and none of the forbidden words`
