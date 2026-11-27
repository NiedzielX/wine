---
id: guest-019-sommelier-pairs-stay-on-top-without-the-label
area: guest
title: "The sommelier pairs stay on top and never carry the pick label"
status: automated
spec:
  path: .ai/specs/implemented/2026-11-18-restaurant-picks.md
  ac: ["AC2", "AC4"]
test:
  file: packages/app/tests/e2e/picks-guest.e2e.test.ts
  it: "the sommelier's pairs keep their company and their places, carry no pick label, and a pick never stands above them"
---

# guest-019-sommelier-pairs-stay-on-top-without-the-label: The sommelier pairs stay on top and never carry the pick label

## Goal

A restaurant pick never stands above a sommelier's pairing and never takes its seal or its place.

## Given

1. The five picks of the previous scenario are published.

## When

1. The public recommendations of every dish are compared with the lists before the picks.

## Then

1. The sommelier's items (primary and other) are the same items in the same order as before.
2. No sommelier item has `restaurantPick: true`; every engine item has no sommelier role.
3. Every sommelier item is listed before the first engine item.

## Edge cases covered

- Wines that are both a pick and a sommelier's pairing keep the seal and have no pick label.

## Data and cleanup

- Snapshot of the whole database before, restored after (the e2e files share one database).

## Test implementation

[packages/app/tests/e2e/picks-guest.e2e.test.ts](../../../packages/app/tests/e2e/picks-guest.e2e.test.ts): `the sommelier's pairs keep their company and their places, carry no pick label, and a pick never stands above them`
