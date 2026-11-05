---
id: restaurant-002-setup-page-shows-menu-import-step
area: restaurant
title: "Setup page shows menu import step"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-restaurant-bootstrap-cli.md
  ac: ["AC2"]
test:
  file: packages/app/tests/e2e/restaurant-create.e2e.test.ts
  it: "sees the Setup of their restaurant, with the menu import as the next step"
---

# restaurant-002-setup-page-shows-menu-import-step: Setup page shows menu import step

## Goal

The new owner sees the Setup page of their restaurant with the menu import as the next step.

## Given

1. The new owner is signed in.

## When

1. The owner opens the Setup page of the new restaurant.

## Then

1. The page loads (200).
2. It shows "Import your menu" and the restaurant name.

## Edge cases covered

None beyond the case above.

## Data and cleanup

- Uses the account made by the test setup. Plain HTTP, no browser. Read-only: the test changes no data.

## Test implementation

[packages/app/tests/e2e/restaurant-create.e2e.test.ts](../../../packages/app/tests/e2e/restaurant-create.e2e.test.ts): `sees the Setup of their restaurant, with the menu import as the next step`
