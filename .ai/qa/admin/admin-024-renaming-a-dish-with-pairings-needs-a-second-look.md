---
id: admin-024-renaming-a-dish-with-pairings-needs-a-second-look
area: admin
title: "Renaming a dish with pairings: warning, confirmation and marks"
status: automated
spec:
  path: .ai/specs/2026-11-16-catalog-field-editing.md
  ac: ["AC20"]
test:
  file: packages/app/tests/e2e/catalog-edit.e2e.test.ts
  it: "renaming a dish that has sommelier pairings: the warning with their number, a confirmation first, an audit row marked as identity, \"Check after rename\" until a newer decision, and the entry in the review queue"
---

# admin-024-renaming-a-dish-with-pairings-needs-a-second-look: Renaming a dish with pairings: warning, confirmation and marks

## Goal

A rename that could mean a different dish is confirmed first and leaves the pairings marked until someone decides again.

## Given

1. A published dish of Halka with approved pairings; the Wine Director signed in.

## When

1. She changes only the price; then tries a new name without the confirmation; then renames with it; then decides each approved pair again.

## Then

1. The form shows how many sommelier pairings the dish has and the warning to rename only to correct the name.
2. The price alone writes an audit row that is not an identity change; the rename without confirmation is refused at the name field; the confirmed rename writes an identity row.
3. The dish page and the wine page mark the pairings "Check after rename", and the review queue lists the dish under "Renamed: check the pairs".
4. After a newer decision on every approved pair the marks and the queue entry are gone.

## Edge cases covered

- A wine rename (producer, name, vintage) works the same way and is asserted in the unit tests.

## Data and cleanup

- Snapshot of the database before, restored after.

## Test implementation

[packages/app/tests/e2e/catalog-edit.e2e.test.ts](../../../packages/app/tests/e2e/catalog-edit.e2e.test.ts): `renaming a dish that has sommelier pairings: the warning with their number, a confirmation first, an audit row marked as identity, "Check after rename" until a newer decision, and the entry in the review queue`
