---
id: admin-014-rarely-chosen-primary-opportunity-at-threshold
area: admin
title: "Rarely chosen primary opportunity at threshold"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-sommelier-opportunities.md
  ac: ["AC11"]
test:
  file: packages/app/tests/e2e/opportunities.e2e.test.ts
  it: "29 views of the primary are silent; the 30th gives S4 with its numbers, and \"Open pairings\" lands on the pairing row of A6"
---

# admin-014-rarely-chosen-primary-opportunity-at-threshold: Rarely chosen primary opportunity at threshold

## Goal

A primary pairing that guests see often but choose rarely raises an opportunity only from 30 views, and "Open pairings" leads to its row.

## Given

1. The sommelier is signed in without JavaScript.
2. Usage events are seeded in the current KPI window: 29 views of the primary wine (2 chosen) and 20 views of another wine (5 chosen).

## When

1. The sommelier opens the Opportunities inbox with 29 views.
2. One more view of the primary is added and the inbox is opened again.
3. The sommelier follows the "Open pairings" link of that opportunity.

## Then

1. With 29 views no "shown rarely chosen" opportunity is listed.
2. With the 30th view exactly one is listed, saying that of 30 views in the last 28 days the guests chose it 2 times (7%) and the other wines 25% of the time.
3. The opportunity has a plain link to the dish’s pairing page anchored on that pairing.
4. Following it lands on the dish pairing page ("Approved for guests") with that pairing row present.
5. The dish pairing page itself shows no "shown rarely chosen" opportunity.

## Edge cases covered

- Just below the threshold (29) is silent; at the threshold (30) it appears.
- The link works without JavaScript.
- Scope: the dish page never shows this opportunity.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka (sommelier Marta Wierzbicka, password-protected demo accounts). The test file uses its own browser session, so cookies are not shared with other files.
- Writes guest usage events under a dedicated engine version into the database and deletes them afterwards.

## Test implementation

[packages/app/tests/e2e/opportunities.e2e.test.ts](../../../packages/app/tests/e2e/opportunities.e2e.test.ts): `29 views of the primary are silent; the 30th gives S4 with its numbers, and "Open pairings" lands on the pairing row of A6`
