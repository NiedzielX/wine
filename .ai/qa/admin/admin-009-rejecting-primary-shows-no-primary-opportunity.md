---
id: admin-009-rejecting-primary-shows-no-primary-opportunity
area: admin
title: "Rejecting primary shows no primary opportunity"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-sommelier-opportunities.md
  ac: ["AC7","AC8"]
test:
  file: packages/app/tests/e2e/opportunities.e2e.test.ts
  it: "rejecting the primary pick of a dish without suggestions shows S1 on A6 and in A14; Ignore and Restore"
---

# admin-009-rejecting-primary-shows-no-primary-opportunity: Rejecting primary shows no primary opportunity

## Goal

Rejecting the primary pairing of a dish that has no suggestions raises the "dish has no primary" opportunity, which can be ignored and restored.

## Given

1. The sommelier is signed in without JavaScript.
2. A dish other than Beef tartare and Duck breast has an approved primary pairing (the test looks one up).

## When

1. The sommelier opens the dish pairings page, approves any suggested pairings of that dish, then rejects the primary pairing.
2. The sommelier opens the Opportunities inbox, presses "Ignore" on that dish’s opportunity, opens the "Ignored" list and presses "Restore".

## Then

1. The dish page shows "Opportunities for this dish" with either "no approved pairing yet" or "approved pairings, but none of them is the Primary", and one "dish_no_primary" opportunity.
2. The inbox lists the same opportunity once.
3. After "Ignore" the page confirms "Opportunity ignored.", the item is gone and the Ignored summary reads "Ignored (n)".
4. After "Restore" the page confirms "Opportunity restored." and the item is back once.

## Edge cases covered

- Ignore and Restore of an opportunity.
- Opportunity appears both on the dish page and in the inbox.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka (sommelier Marta Wierzbicka, password-protected demo accounts). The test file uses its own browser session, so cookies are not shared with other files.
- Changes pairing status of one seeded dish (approve suggestions, reject primary). An undo step restores the primary: restore as suggestion, approve, set the role back to primary.
- The undo runs after the file and ignores errors.

## Test implementation

[packages/app/tests/e2e/opportunities.e2e.test.ts](../../../packages/app/tests/e2e/opportunities.e2e.test.ts): `rejecting the primary pick of a dish without suggestions shows S1 on A6 and in A14; Ignore and Restore`

**Notes for the reviewer:** The test picks the dish dynamically from the seed; the exact dish is not fixed.
