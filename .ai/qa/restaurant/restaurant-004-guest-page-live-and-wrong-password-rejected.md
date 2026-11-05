---
id: restaurant-004-guest-page-live-and-wrong-password-rejected
area: restaurant
title: "Guest page live and wrong password rejected"
status: automated
spec:
  path: none
  ac: []
test:
  file: packages/app/tests/e2e/restaurant-create.e2e.test.ts
  it: "the guest page of the new restaurant is up from the start, and its owner cannot sign in with a wrong password"
---

# restaurant-004-guest-page-live-and-wrong-password-rejected: Guest page live and wrong password rejected

## Goal

The guest page of a new restaurant works from the start and its owner cannot sign in with a wrong password.

## Given

1. The new restaurant exists and its owner account was created.

## When

1. A visitor opens the guest page of the new restaurant.
2. Someone tries to sign in as the owner with a wrong password.

## Then

1. The guest page loads (200).
2. The sign-in is refused with 401.

## Edge cases covered

- Wrong password.

## Data and cleanup

- Uses the account made by the test setup. Plain HTTP, no browser. Read-only: the test changes no data.

## Test implementation

[packages/app/tests/e2e/restaurant-create.e2e.test.ts](../../../packages/app/tests/e2e/restaurant-create.e2e.test.ts): `the guest page of the new restaurant is up from the start, and its owner cannot sign in with a wrong password`
