---
id: guest-002-landing-page-shows-menu-and-whole-table-card
area: guest
title: "Landing page shows menu and whole table card"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-whole-table-waiter-path.md
  ac: ["R8"]
test:
  file: packages/app/tests/e2e/home.e2e.test.ts
  it: "the landing page names the restaurant and shows the menu right away"
---

# guest-002-landing-page-shows-menu-and-whole-table-card: Landing page shows menu and whole table card

## Goal

The landing page names the restaurant and shows the menu straight away, with a "Whole table" card above it.

## Given

1. A guest opens the Halka landing page.

## When

1. The page finishes loading.

## Then

1. The main heading is "Halka".
2. The page shows "Pick your dish" and the dish "Duck breast".
3. The "Whole table" card reads "Several dishes on the table?" with the button "Find a bottle for the table".
4. The old header button text "Pair a bottle for the table" is gone.

## Edge cases covered

- The old header button is absent (requirement R8 of the whole-table spec).

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- Read-only: the test changes no data.

## Test implementation

[packages/app/tests/e2e/home.e2e.test.ts](../../../packages/app/tests/e2e/home.e2e.test.ts): `the landing page names the restaurant and shows the menu right away`

**Notes for the reviewer:** The test cites requirement R8 in a comment, not in its title.
