---
id: admin-037-pick-marks-in-wine-list-wine-and-pairings
area: admin
title: "Pick marks in the wine list, wine details and pairings, live only after the publish"
status: automated
spec:
  path: .ai/specs/implemented/2026-11-18-restaurant-picks.md
  ac: ["AC8", "AC17"]
test:
  file: packages/app/tests/e2e/picks-panel.e2e.test.ts
  it: "A4, A5 and A6 carry the mark; after the publish it is live, and an unmarked live pick waits for the next publish"
---

# admin-037-pick-marks-in-wine-list-wine-and-pairings: Pick marks in the wine list, wine details and pairings, live only after the publish

## Goal

A wine that is a pick is marked in the wine list, its own screen and the pairing screen of a dish; a change that guests do not see yet is shown as waiting, never as live.

## Given

1. The General Manager and the Wine Director are signed in; the restaurant is published; Halka has no picks.

## When

1. The General Manager marks a wine.
2. The Wine Director publishes.
3. The General Manager unmarks the wine.
4. The Wine Director publishes again.

## Then

1. Before the publish the wine list says “Pick, waiting for publish” and the wine screen says it is marked but guests do not see it as a pick until the publish.
2. After the publish the set reports the pick as published, the picks screen no longer says “waiting for publish” or “Not visible to guests yet”, and a dish page has the card “Restaurant’s picks on this dish”.
3. After the unmarking the picks screen says “No longer a pick, guests still see it until you publish” and the Publish screen says “+0 / −1”; after the second publish the Publish screen has no pending picks.

## Edge cases covered

- A pick removed but still live for guests is shown as such, not simply as gone.

## Data and cleanup

- Snapshot of the whole database before, restored after (the publishes are undone with it).

## Test implementation

[packages/app/tests/e2e/picks-panel.e2e.test.ts](../../../packages/app/tests/e2e/picks-panel.e2e.test.ts): `A4, A5 and A6 carry the mark; after the publish it is live, and an unmarked live pick waits for the next publish`
