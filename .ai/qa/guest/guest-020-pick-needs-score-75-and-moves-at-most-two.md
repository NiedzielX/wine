---
id: guest-020-pick-needs-score-75-and-moves-at-most-two
area: guest
title: "A pick needs a raw score of 75 and at most two move up"
status: automated
spec:
  path: .ai/specs/2026-11-18-restaurant-picks.md
  ac: ["AC3"]
test:
  file: packages/app/tests/e2e/picks-guest.e2e.test.ts
  it: "only wines from a raw score of 75 are labelled and at most two picks move to the front of the engine's group"
---

# guest-020-pick-needs-score-75-and-moves-at-most-two: A pick needs a raw score of 75 and at most two move up

## Goal

Only a wine that already fits the dish well is labelled, and the restaurant can move at most two wines up on one list.

## Given

1. The five picks are published.

## When

1. The lists of every dish after the publish are compared with the lists before it.

## Then

1. Every labelled wine has a Match Score of at least 75.
2. On no list do more than two picks stand higher among the engine's wines than they did before.
3. At least one dish has a pick that moved up.

## Edge cases covered

- The boundary values 74 and 75 are in the unit tests of the layer; this scenario checks the same rules on the real menu.

## Data and cleanup

- Snapshot of the whole database before, restored after (the e2e files share one database).

## Test implementation

[packages/app/tests/e2e/picks-guest.e2e.test.ts](../../../packages/app/tests/e2e/picks-guest.e2e.test.ts): `only wines from a raw score of 75 are labelled and at most two picks move to the front of the engine's group`
