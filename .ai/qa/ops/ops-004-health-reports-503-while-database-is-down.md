---
id: ops-004-health-reports-503-while-database-is-down
area: ops
title: "The health check follows the database away and back"
status: automated
spec:
  path: .ai/specs/2026-10-15-production-deployment.md
  ac: ["AC5"]
test:
  file: packages/app/tests/e2e/health.e2e.test.ts
  it: "answers 503 with no connection detail while the database is down and 200 again when it is back, without a restart"
---

# ops-004-health-reports-503-while-database-is-down: The health check follows the database away and back

## Goal

While the database is unreachable the health check says 503 without any connection detail, and says 200 again when the database returns, with no restart of the app.

## Given

1. A second built app runs on its own connection pool and reaches the database through a relay the test controls.
2. The app was started with a public https address and no escape hatch for local addresses.

## When

1. Ask for health while the relay works.
2. Stop the relay (the database is gone) and ask again.
3. Start the relay again and ask a third time.

## Then

1. The first answer is 200.
2. The second answer is 503 with status "unavailable" and database check "unreachable".
3. The 503 body contains no host, port, user name, database name or driver message.
4. The third answer is 200 with database check "ok", from the same process.

## Edge cases covered

- A database that comes back on the same address.
- A valid public https address lets a production start pass the address check.

## Data and cleanup

- Nothing is written. The second app and the relay are stopped at the end; the shared e2e database is untouched.

## Test implementation

[packages/app/tests/e2e/health.e2e.test.ts](../../../packages/app/tests/e2e/health.e2e.test.ts): `answers 503 with no connection detail while the database is down and 200 again when it is back, without a restart`
