---
id: usage-010-pick-flag-in-usage-events
area: usage
title: "Usage events carry the pick flag only for a labelled wine"
status: automated
spec:
  path: .ai/specs/2026-11-18-restaurant-picks.md
  ac: ["AC14"]
test:
  file: packages/app/tests/e2e/picks-guest.e2e.test.ts
  it: "recommendations_viewed items, wine_viewed and wine_selected have `pick: true` for the pick and nothing else has it"
---

# usage-010-pick-flag-in-usage-events: Usage events carry the pick flag only for a labelled wine

## Goal

The events of a guest session say which wines carried the restaurant's pick label, so later figures can tell them from the engine's own choice.

## Given

1. The five picks are published.

## When

1. A guest opens the wines of a dish, the page of the labelled wine, "Choose this wine", and the page of an unlabelled wine.

## Then

1. `recommendations_viewed` has `pick: true` on the labelled item and no `pick` key on the others.
2. `wine_viewed` and `wine_selected` of the labelled wine have `props.pick: true`.
3. `wine_viewed` of the unlabelled wine has no `pick` key.

## Edge cases covered

- Events from before the picks have no `pick` key either: the key is added only when the label was shown.

## Data and cleanup

- Snapshot of the whole database before, restored after (the e2e files share one database).

## Test implementation

[packages/app/tests/e2e/picks-guest.e2e.test.ts](../../../packages/app/tests/e2e/picks-guest.e2e.test.ts): `recommendations_viewed items, wine_viewed and wine_selected have `pick: true` for the pick and nothing else has it`
