---
id: ops-001-metrics-need-bearer-token
area: ops
title: "Metrics need the bearer token"
status: automated
spec:
  path: .ai/specs/2026-11-04-platform-quality-and-compliance.md
  ac: ["AC1"]
test:
  file: packages/app/tests/e2e/observability.e2e.test.ts
  it: "serves metrics only with the bearer token and exposes no slug or id"
---

# ops-001-metrics-need-bearer-token: Metrics need the bearer token

## Goal

An operator scrapes process metrics with a token; nobody else can read them and they reveal no customer.

## Given

1. The app runs with a metrics token set.
2. One request to the public menu of "halka" was made.

## When

1. Request the metrics without a token, then with a wrong token, then with the right one.

## Then

1. The first two answers are 401.
2. The third is 200, not cacheable, in the Prometheus text format.
3. The menu request is counted under the route pattern with the slug as a placeholder.
4. The text contains neither the restaurant slug nor any identifier.

## Edge cases covered

- Wrong token; no token.

## Data and cleanup

- Nothing is written. The built app of the e2e run is started with a test-only metrics token. Plain HTTP, no browser.

## Test implementation

[packages/app/tests/e2e/observability.e2e.test.ts](../../../packages/app/tests/e2e/observability.e2e.test.ts): `serves metrics only with the bearer token and exposes no slug or id`
