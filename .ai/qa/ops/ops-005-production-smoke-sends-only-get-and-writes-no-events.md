---
id: ops-005-production-smoke-sends-only-get-and-writes-no-events
area: ops
title: "Production smoke test sends only GET requests and writes no guest events"
status: automated
spec:
  path: .ai/specs/2026-10-15-production-deployment.md
  ac: ["AC7"]
test:
  file: packages/app/tests/e2e/health.e2e.test.ts
  it: "passes against the running app, sends only GET requests and writes no guest events"
---

# ops-005-production-smoke-sends-only-get-and-writes-no-events: Production smoke test sends only GET requests and writes no guest events

## Goal

An operator checks a real installation with the production smoke test without changing anything on it.

## Given

1. The built app runs on PostgreSQL with "halka" as the restaurant that the start page leads to.
2. A normal request to the guest start page (without the synthetic header) was counted as a guest event, so counting is known to work.

## When

1. Run the smoke test in production mode against the app address and the restaurant slug.

## Then

1. The run ends with "All production smoke checks passed" and exit code 0, with no failed check.
2. Afterwards the number of guest events is exactly what it was before the run.

## Edge cases covered

- The script itself refuses to send anything but GET (covered by the script tests in the testkit package).

## Data and cleanup

- Writes two guest events of its own control requests (ordinary visits). The smoke run adds none.

## Test implementation

[packages/app/tests/e2e/health.e2e.test.ts](../../../packages/app/tests/e2e/health.e2e.test.ts): `passes against the running app, sends only GET requests and writes no guest events`
