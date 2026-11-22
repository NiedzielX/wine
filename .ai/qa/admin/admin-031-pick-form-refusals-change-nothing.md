---
id: admin-031-pick-form-refusals-change-nothing
area: admin
title: "Pick form refusals change nothing"
status: automated
spec:
  path: .ai/specs/2026-11-18-restaurant-picks.md
  ac: ["AC10", "AC11"]
test:
  file: packages/app/tests/e2e/picks-panel.e2e.test.ts
  it: "the Wine Director’s forged post, a stale version, a sixth pick, an unknown wine and a hidden wine are refused and leave the tables as they were"
---

# admin-031-pick-form-refusals-change-nothing: Pick form refusals change nothing

## Goal

A forged post of the Wine Director, a stale version, a sixth pick, an unknown or non-UUID wine and a wine hidden from guests are all refused with a message in words, and the data is exactly as before.

## Given

1. The General Manager has marked five wines through the form (the positive control).
2. The Wine Director and another restaurant’s owner are signed in.

## When

1. The Wine Director posts an unmark with the right version.
2. The General Manager posts with a stale version, then marks a sixth wine, an unknown id and a text that is not an id.
3. The other restaurant’s owner posts an unmark under Halka’s address.
4. The General Manager empties the set and marks a hidden wine.

## Then

1. The answers are “forbidden”, “version_conflict”, “too_many_picks”, “not_found”, “not_found”; the other restaurant’s owner gets no “saved”.
2. The digest of every table and the whole picks screen are equal before and after the refused posts; the screen shows the “at most 5 wines” message in words for the error code.
3. Marking a hidden wine answers “wine_inactive” and the set stays empty.

## Edge cases covered

- The check compares whole tables and the whole page, not counters.

## Data and cleanup

- Snapshot of the whole database before, restored after.

## Test implementation

[packages/app/tests/e2e/picks-panel.e2e.test.ts](../../../packages/app/tests/e2e/picks-panel.e2e.test.ts): `the Wine Director’s forged post, a stale version, a sixth pick, an unknown wine and a hidden wine are refused and leave the tables as they were`
