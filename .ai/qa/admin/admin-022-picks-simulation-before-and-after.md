---
id: admin-022-picks-simulation-before-and-after
area: admin
title: "Simulator shows before and after and writes nothing"
status: automated
spec:
  path: .ai/specs/2026-11-18-restaurant-picks.md
  ac: ["AC9"]
test:
  file: packages/app/tests/e2e/picks.e2e.test.ts
  it: "the simulation shows what a publish would change and is no more than that: after the publish the lists are the same and nothing was written"
---

# admin-022-picks-simulation-before-and-after: Simulator shows before and after and writes nothing

## Goal

The simulator says how the lists of the menu would change for the working set of picks, changes no score, writes nothing, and agrees with the state after the publish.

## Given

1. The General Manager of Halka has marked five wines; the Wine Director is signed in; nothing is published yet for these picks.

## When

1. The Wine Director asks the simulation for the working set, for an empty set, for one wine, for six wines and for an unknown dish.
2. The Wine Director publishes; the simulation is asked again.

## Then

1. The working set reorders at least one dish; no wine has two different Match Scores in the two lists of a dish; the sommelier's pairs keep their place and carry no pick mark; every pick without effect has a reason.
2. An empty set reorders nothing; one wine is the only tried wine; six wines answer 422 and an unknown dish 404; the picks, history and versions tables are the same before and after the reads.
3. After the publish the lists before and after are equal for every dish, every pick is published, and the earlier "after" is now the "before".

## Edge cases covered

- The Wine Director may publish picks set by the General Manager.

## Data and cleanup

- Snapshot of the whole database before, restored after.

## Test implementation

[packages/app/tests/e2e/picks.e2e.test.ts](../../../packages/app/tests/e2e/picks.e2e.test.ts): `the simulation shows what a publish would change and is no more than that: after the publish the lists are the same and nothing was written`
