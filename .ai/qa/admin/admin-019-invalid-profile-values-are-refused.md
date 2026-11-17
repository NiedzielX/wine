---
id: admin-019-invalid-profile-values-are-refused
area: admin
title: "Invalid profile values are refused"
status: automated
spec:
  path: .ai/specs/2026-11-04-panel-completion.md
  ac: ["AC7", "AC13"]
test:
  file: packages/app/tests/e2e/profile-editing.e2e.test.ts
  it: "an invalid value is refused and nothing is saved: scales from 0 to 5, alcohol from 0 to 25"
---

# admin-019-invalid-profile-values-are-refused: Invalid profile values are refused

## Goal

A scale outside 0 to 5 or an alcohol above 25 is refused and nothing is saved.

## Given

1. Signed in as the Wine Director; a dish and a wine with their forms open.

## When

1. Submit a dish profile with intensity 9.
2. Submit a wine profile with alcohol 30.
3. Ask for a preview with intensity 9.

## Then

1. Both saves go back with the profile-invalid message; the dish and wine rows are unchanged (whole rows compared).
2. The preview says it needs valid values and shows no save buttons.

## Edge cases covered

- Only these two values are exercised; the full set of invalid inputs is in the unit tests.

## Data and cleanup

- Snapshot of the database before, restored after.

## Test implementation

[packages/app/tests/e2e/profile-editing.e2e.test.ts](../../../packages/app/tests/e2e/profile-editing.e2e.test.ts): `an invalid value is refused and nothing is saved: scales from 0 to 5, alcohol from 0 to 25`
