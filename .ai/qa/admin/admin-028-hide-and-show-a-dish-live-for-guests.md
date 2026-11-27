---
id: admin-028-hide-and-show-a-dish-live-for-guests
area: admin
title: "Hide and show a dish: live for guests, no publish"
status: automated
spec:
  path: .ai/specs/implemented/2026-11-16-catalog-field-editing.md
  ac: ["AC14", "AC15"]
test:
  file: packages/app/tests/e2e/catalog-visibility.e2e.test.ts
  it: "A3 without JavaScript: Hide takes the dish away from guests at once, Show brings it back with no publish, the unpublished counter stays and two audit rows name who"
---

# admin-028-hide-and-show-a-dish-live-for-guests: Hide and show a dish: live for guests, no publish

## Goal

The Wine Director takes a dish off the menu and puts it back with a plain button, and guests see each change at once.

## Given

1. The Wine Director signed in; a published dish; JavaScript off (the page as HTML, the button posted as a form).

## When

1. She opens the dish page, presses "Hide from guests", reads the page, presses "Show to guests".

## Then

1. After hiding, the public menu no longer lists the dish and its guest page answers 404; the page offers "Show to guests" and a flash says guests no longer see it.
2. After showing, both are back, with no publish; the unpublished-changes counter was the same throughout.
3. Two audit rows (hidden, shown) hold the status before and after and the name and account of the editor.

## Edge cases covered

- The dish page of a guest and the public API read the live status.

## Data and cleanup

- Snapshot of the database before, restored after.

## Test implementation

[packages/app/tests/e2e/catalog-visibility.e2e.test.ts](../../../packages/app/tests/e2e/catalog-visibility.e2e.test.ts): `A3 without JavaScript: Hide takes the dish away from guests at once, Show brings it back with no publish, the unpublished counter stays and two audit rows name who`
