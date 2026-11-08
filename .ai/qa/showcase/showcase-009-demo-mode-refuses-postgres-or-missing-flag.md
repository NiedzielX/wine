---
id: showcase-009-demo-mode-refuses-postgres-or-missing-flag
area: showcase
title: "Demo mode refuses to start on PostgreSQL or without the demo-data flag"
status: automated
spec:
  path: .ai/specs/2026-11-04-sales-demo-and-roi-calculator.md
  ac: ["AC1"]
test:
  file: packages/app/tests/e2e/showcase.e2e.test.ts
  it: "refuses to start in demo mode on PostgreSQL or without ALLOW_DEMO_DATA, naming the variable"
---

# showcase-009-demo-mode-refuses-postgres-or-missing-flag: Demo mode refuses to start on PostgreSQL or without the demo-data flag

## Goal

The demo can never run next to real restaurants: a wrong combination stops the start with a message that names the variable.

## Given

1. The built app and a PostgreSQL server.

## When

1. Start the app in demo mode with the PostgreSQL data source.
2. Start the app in demo mode with in-memory data but without the flag that allows demo data.

## Then

1. The first start exits with code 1 and the message says demo mode requires the in-memory data source.
2. The second start exits with code 1 and the message says demo mode requires the flag that allows demo data.

## Edge cases covered

- The https rule for production and the combination of both problems are covered by the unit tests of the configuration.

## Data and cleanup

- The app never reaches the database; the e2e PostgreSQL server only supplies an address.

## Test implementation

[packages/app/tests/e2e/showcase.e2e.test.ts](../../../packages/app/tests/e2e/showcase.e2e.test.ts): `refuses to start in demo mode on PostgreSQL or without ALLOW_DEMO_DATA, naming the variable`
