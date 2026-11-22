---
id: admin-032-pick-simulator-form-writes-nothing
area: admin
title: "Pick simulator form: before and after in the URL, open to the Wine Director, writes nothing"
status: automated
spec:
  path: .ai/specs/2026-11-18-restaurant-picks.md
  ac: ["AC9", "AC17"]
test:
  file: packages/app/tests/e2e/picks-panel.e2e.test.ts
  it: "shows before and after for the tried wines, is open to the Wine Director, and writes nothing"
---

# admin-032-pick-simulator-form-writes-nothing: Pick simulator form: before and after in the URL, open to the Wine Director, writes nothing

## Goal

The simulator is a plain GET form: the ticked wines are in the URL, both roles can use it, a wrong request is told in words, and nothing is written.

## Given

1. Halka has no picks; the General Manager and the Wine Director are signed in.

## When

1. Each role opens the screen with five wines in the address.
2. The Wine Director opens it with an empty set, with six wines and with an unknown wine id.

## Then

1. Both see how many dishes change order, “What each pick does”, and exactly five ticked wines.
2. The empty set says “No picks to try.”; six wines say “Check the simulation: choose at most 5 wines and a dish from the list.” and show no result; an unknown id is answered like any other wine (no error).
3. The digest of every table is equal before and after.

## Edge cases covered

- An unknown wine id is not told apart from a foreign one.

## Data and cleanup

- Snapshot of the whole database before, restored after.

## Test implementation

[packages/app/tests/e2e/picks-panel.e2e.test.ts](../../../packages/app/tests/e2e/picks-panel.e2e.test.ts): `shows before and after for the tried wines, is open to the Wine Director, and writes nothing`
