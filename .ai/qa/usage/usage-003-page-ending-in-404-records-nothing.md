---
id: usage-003-page-ending-in-404-records-nothing
area: usage
title: "Page ending in 404 records nothing"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-guest-usage-events.md
  ac: ["AC6a"]
test:
  file: packages/app/tests/e2e/usage-events.e2e.test.ts
  it: "a page that ends in 404 records nothing (AC6a)"
---

# usage-003-page-ending-in-404-records-nothing: Page ending in 404 records nothing

## Goal

A page that ends in "not found" records no usage events.

## Given

1. A fixed session id.

## When

1. A guest opens a wines page for a dish that does not exist and a landing page of a restaurant that does not exist, both with that session id.

## Then

1. Both requests return 404.
2. After a wait of one second no events exist for the session.

## Edge cases covered

- Missing dish and missing restaurant.

## Data and cleanup

- Plain HTTP requests with a phone user agent, as a browser without JavaScript would send them; no real browser is started.
- Uses a fixed session id; nothing is stored.

## Test implementation

[packages/app/tests/e2e/usage-events.e2e.test.ts](../../../packages/app/tests/e2e/usage-events.e2e.test.ts): `a page that ends in 404 records nothing (AC6a)`
