---
id: restaurant-003-owner-refused-by-other-restaurant-panel-and-api
area: restaurant
title: "Owner refused by other restaurant panel and api"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-restaurant-bootstrap-cli.md
  ac: ["AC2"]
test:
  file: packages/app/tests/e2e/restaurant-create.e2e.test.ts
  it: "is refused by the panel and the API of Halka with 403"
---

# restaurant-003-owner-refused-by-other-restaurant-panel-and-api: Owner refused by other restaurant panel and api

## Goal

The new owner is kept out of the demo restaurant: panel pages, the API and a publish request are refused with 403.

## Given

1. The new owner is signed in.

## When

1. The owner opens /admin/halka and /admin/halka/setup, reads the Halka pairings API, and posts a publish request to Halka with a valid CSRF token.

## Then

1. All four requests return 403.

## Edge cases covered

- Panel pages, read API and write API are each refused.

## Data and cleanup

- Uses the account made by the test setup. Plain HTTP, no browser. The publish request is refused, so nothing is changed.

## Test implementation

[packages/app/tests/e2e/restaurant-create.e2e.test.ts](../../../packages/app/tests/e2e/restaurant-create.e2e.test.ts): `is refused by the panel and the API of Halka with 403`
