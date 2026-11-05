---
id: guest-014-table-quantity-choice-carries-through-bottle-flow
area: guest
title: "Table quantity choice carries through bottle flow"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-whole-table-waiter-path.md
  ac: ["R16","AC19"]
test:
  file: packages/app/tests/e2e/table-quantity.e2e.test.ts
  it: "390 px, G6: no amount before a choice; a tap on \"6\" shows 3 bottles · 960 zł; G7 and G8 keep the six people"
---

# guest-014-table-quantity-choice-carries-through-bottle-flow: Table quantity choice carries through bottle flow

## Goal

On the whole-table result no amount of wine is shown until the guest chooses the number of people, and the choice follows the guest to the bottle page and the confirmation.

## Given

1. A script-free browser at 390 px width; six dishes chosen for the table.

## When

1. The guest opens the table result and taps "6" people.
2. The guest taps the bottle card, then "Choose this wine".

## Then

1. Before any choice the page asks "How many people are drinking wine?", shows no amount, and has no sideways scroll.
2. After the tap it shows "For 6 people: 3 bottles · 960", marks "6 people" as current, and has no sideways scroll.
3. The bottle page and the final "For the table" screen show the same amount.
4. The recorded views are one without a number of people and one with 6; the recorded wine selection has context table and 6 people.

## Edge cases covered

- No quantity before a choice (owner decision Q4).
- No sideways scroll at 390 px.
- People count is stored with the events.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- All script requests of the browser session are aborted before the first page, so the page is checked as plain HTML.
- Writes guest usage events under the session id of the page; they are not deleted.

## Test implementation

[packages/app/tests/e2e/table-quantity.e2e.test.ts](../../../packages/app/tests/e2e/table-quantity.e2e.test.ts): `390 px, G6: no amount before a choice; a tap on "6" shows 3 bottles · 960 zł; G7 and G8 keep the six people`

**Notes for the reviewer:** The amount 960 is matched as the start of a price ("960"), so the currency text after it is not asserted.
