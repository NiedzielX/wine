---
id: guest-001-bare-address-opens-demo-restaurant
area: guest
title: "Bare address opens demo restaurant"
status: automated
spec:
  path: none
  ac: []
test:
  file: packages/app/tests/e2e/home.e2e.test.ts
  it: "the bare address opens the demo restaurant"
---

# guest-001-bare-address-opens-demo-restaurant: Bare address opens demo restaurant

## Goal

The bare web address of the app opens the demo restaurant Halka.

## Given

1. A guest opens the app without any path.

## When

1. The guest opens the root address (/).

## Then

1. The browser ends up on the Halka guest page (/r/halka).

## Edge cases covered

None beyond the case above.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- Read-only: the test changes no data.

## Test implementation

[packages/app/tests/e2e/home.e2e.test.ts](../../../packages/app/tests/e2e/home.e2e.test.ts): `the bare address opens the demo restaurant`
