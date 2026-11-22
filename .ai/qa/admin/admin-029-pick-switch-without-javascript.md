---
id: admin-029-pick-switch-without-javascript
area: admin
title: "Marking a pick works without JavaScript and waits for the publish"
status: automated
spec:
  path: .ai/specs/2026-11-18-restaurant-picks.md
  ac: ["AC8", "AC10"]
test:
  file: packages/app/tests/e2e/picks-panel.e2e.test.ts
  it: "marks a wine: the redirect says so, the page shows it waiting for publish, A11 counts +1 / −0, the history row names who"
---

# admin-029-pick-switch-without-javascript: Marking a pick works without JavaScript and waits for the publish

## Goal

The General Manager marks a wine with a plain form post; the screen shows it as waiting for publish, the Publish screen counts it, and the history says who did it.

## Given

1. The General Manager is signed in; Halka has no picks.

## When

1. The form of one wine is posted the way a browser without JavaScript sends it, with the version the page showed.
2. The same switch is posted again.

## Then

1. The redirect goes back to the screen with “saved=pick_marked”; the page says “Marked as the restaurant’s pick. Guests see it after you publish.”, “1 of 5”, “Pick, waiting for publish” and “Not visible to guests yet: 1 to add and 0 to remove.”; the switch now reads “Remove pick”.
2. The Publish screen lists “Restaurant’s picks: +1 / −0”; the table of picks differs from before; the last history row is by Tomasz Lis and enabled.
3. The second post redirects with “saved=pick_unchanged” and writes no new history row.

## Edge cases covered

- The idempotent post leaves the number of history rows as it was.

## Data and cleanup

- Snapshot of the whole database before, restored after; the set of picks is emptied first.

## Test implementation

[packages/app/tests/e2e/picks-panel.e2e.test.ts](../../../packages/app/tests/e2e/picks-panel.e2e.test.ts): `marks a wine: the redirect says so, the page shows it waiting for publish, A11 counts +1 / −0, the history row names who`
