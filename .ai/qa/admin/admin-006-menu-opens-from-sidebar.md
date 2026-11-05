---
id: admin-006-menu-opens-from-sidebar
area: admin
title: "Menu opens from sidebar"
status: automated
spec:
  path: none
  ac: []
test:
  file: packages/app/tests/e2e/admin.e2e.test.ts
  it: "the menu opens from the sidebar with the seeded dishes"
---

# admin-006-menu-opens-from-sidebar: Menu opens from sidebar

## Goal

The sommelier opens the restaurant menu from the sidebar and sees the seeded dishes.

## Given

1. The sommelier is signed in.

## When

1. The sommelier clicks the "Menu" link in the sidebar.

## Then

1. The browser shows the menu admin page (/admin/halka/menu).
2. The page lists the seeded dish "Beef tartare".

## Edge cases covered

None beyond the case above.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka (sommelier Marta Wierzbicka, password-protected demo accounts). The test file uses its own browser session, so cookies are not shared with other files.
- The test continues the browser session of the earlier tests in the same file (page state and sign-in carry over), so it is not meant to run alone.
- Read-only: the test changes no data.

## Test implementation

[packages/app/tests/e2e/admin.e2e.test.ts](../../../packages/app/tests/e2e/admin.e2e.test.ts): `the menu opens from the sidebar with the seeded dishes`
