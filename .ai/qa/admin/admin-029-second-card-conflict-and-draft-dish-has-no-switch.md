---
id: admin-029-second-card-conflict-and-draft-dish-has-no-switch
area: admin
title: "Hide button: stale card is a conflict, a draft dish has no switch"
status: automated
spec:
  path: .ai/specs/2026-11-16-catalog-field-editing.md
  ac: ["AC14", "AC15"]
test:
  file: packages/app/tests/e2e/catalog-visibility.e2e.test.ts
  it: "two cards: the second button, made before the first one hid the dish, is a version conflict and changes nothing; a draft dish has no button and the action refuses it"
---

# admin-029-second-card-conflict-and-draft-dish-has-no-switch: Hide button: stale card is a conflict, a draft dish has no switch

## Goal

A hide button made before someone else hid the dish does not act on a state it never saw, and a dish that is still a draft cannot be hidden or shown.

## Given

1. Two copies of the dish page of the same published dish; a draft dish.

## When

1. The first copy hides the dish; the second copy presses its (now stale) button.
2. The draft dish page is opened and its action is posted by hand.

## Then

1. The second button ends with the version-conflict message; the dish stays hidden and no audit row is added.
2. The draft page has neither "Hide from guests" nor "Show to guests"; the posted action answers "cannot be hidden or shown now" and the dish stays a draft.

## Edge cases covered

- A reloaded copy works again.

## Data and cleanup

- Snapshot of the database before, restored after.

## Test implementation

[packages/app/tests/e2e/catalog-visibility.e2e.test.ts](../../../packages/app/tests/e2e/catalog-visibility.e2e.test.ts): `two cards: the second button, made before the first one hid the dish, is a version conflict and changes nothing; a draft dish has no button and the action refuses it`
