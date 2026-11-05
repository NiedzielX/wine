---
id: restaurant-001-new-owner-signs-in-and-belongs-to-new-restaurant
area: restaurant
title: "New owner signs in and belongs to new restaurant"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-restaurant-bootstrap-cli.md
  ac: ["AC2"]
test:
  file: packages/app/tests/e2e/restaurant-create.e2e.test.ts
  it: "the new owner signs in and belongs only to the new restaurant"
---

# restaurant-001-new-owner-signs-in-and-belongs-to-new-restaurant: New owner signs in and belongs to new restaurant

## Goal

The owner created by the operator command can sign in and belongs only to the new restaurant.

## Given

1. The restaurant "Bistro E2E" and its owner were created by the real operator command after the demo seed.

## When

1. The owner signs in through the API and asks who they are.

## Then

1. Sign-in succeeds and a session cookie is issued.
2. The owner has exactly one membership: the new restaurant, role "owner".

## Edge cases covered

- No membership in the demo restaurant.

## Data and cleanup

- Uses the account made once for the whole run by the test setup (the operator command); the test only signs in. Plain HTTP against the built app, no browser.

## Test implementation

[packages/app/tests/e2e/restaurant-create.e2e.test.ts](../../../packages/app/tests/e2e/restaurant-create.e2e.test.ts): `the new owner signs in and belongs only to the new restaurant`
