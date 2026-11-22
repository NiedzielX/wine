---
id: guest-018-picks-reach-guests-only-with-a-publish
area: guest
title: "Restaurant picks reach guests only with a publish"
status: automated
spec:
  path: .ai/specs/2026-11-18-restaurant-picks.md
  ac: ["AC7", "AC15"]
test:
  file: packages/app/tests/e2e/picks-guest.e2e.test.ts
  it: "an unpublished set changes no byte of any guest payload; after the publish wines carry the label and every score and reason is the engine's"
---

# guest-018-picks-reach-guests-only-with-a-publish: Restaurant picks reach guests only with a publish

## Goal

A set of restaurant picks changes what guests see only after a publish, and then changes the order and the label but never a Match Score or a reason.

## Given

1. Halka is published without picks; the General Manager (Tomasz) and the Wine Director (Marta) can sign in.
2. The public recommendations of every published dish and the guest wine page of every dish were read.

## When

1. The General Manager marks five active wines; nothing is published.
2. All guest payloads are read again.
3. The Wine Director publishes.
4. All guest payloads are read a third time.

## Then

1. Before the publish every item of the public API has `restaurantPick: false` and no guest page has the label.
2. With the set marked but not published every payload (API text and guest page HTML) is identical to the first read.
3. After the publish at least one item carries `restaurantPick: true` and at least one dish changes order.
4. No wine has a different `matchScore` or `why` than before; the numbers are the engine's.

## Edge cases covered

- The comparison is on whole payloads, not on counts; pages are compared with the per-request parts removed.

## Data and cleanup

- Snapshot of the whole database before, restored after (the e2e files share one database).

## Test implementation

[packages/app/tests/e2e/picks-guest.e2e.test.ts](../../../packages/app/tests/e2e/picks-guest.e2e.test.ts): `an unpublished set changes no byte of any guest payload; after the publish wines carry the label and every score and reason is the engine's`
