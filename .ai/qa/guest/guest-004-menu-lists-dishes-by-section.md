---
id: guest-004-menu-lists-dishes-by-section
area: guest
title: "Menu lists dishes by section"
status: automated
spec:
  path: none
  ac: []
test:
  file: packages/app/tests/e2e/home.e2e.test.ts
  it: "the menu lists the dishes by section"
---

# guest-004-menu-lists-dishes-by-section: Menu lists dishes by section

## Goal

The menu page lists the dishes grouped under section headings.

## Given

1. A guest opens the Halka menu page.

## When

1. The page finishes loading.

## Then

1. The page shows the dish "Duck breast".
2. The page shows the section heading "Starters".

## Edge cases covered

None beyond the case above.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- Read-only: the test changes no data.

## Test implementation

[packages/app/tests/e2e/home.e2e.test.ts](../../../packages/app/tests/e2e/home.e2e.test.ts): `the menu lists the dishes by section`
