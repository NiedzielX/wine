---
id: guest-005-dish-shows-wines-and-quick-preferences
area: guest
title: "Dish shows wines and quick preferences"
status: automated
spec:
  path: none
  ac: []
test:
  file: packages/app/tests/e2e/home.e2e.test.ts
  it: "one tap on a dish shows its wines and the quick preferences"
---

# guest-005-dish-shows-wines-and-quick-preferences: Dish shows wines and quick preferences

## Goal

One tap on a dish shows its wines and the quick preferences.

## Given

1. The guest is on the menu page.

## When

1. The guest taps the "Duck breast" link.

## Then

1. The browser shows the wines page of that dish.
2. The page shows "Sommelier’s pairing" and "By the glass".

## Edge cases covered

None beyond the case above.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- The test continues the browser session of the earlier tests in the same file (the page it starts on is the one the previous test left), so it is not meant to run alone.
- Read-only: the test changes no data.

## Test implementation

[packages/app/tests/e2e/home.e2e.test.ts](../../../packages/app/tests/e2e/home.e2e.test.ts): `one tap on a dish shows its wines and the quick preferences`
