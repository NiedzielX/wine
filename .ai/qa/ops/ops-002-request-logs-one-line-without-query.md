---
id: ops-002-request-logs-one-line-without-query
area: ops
title: "An API request logs one line without query or headers"
status: automated
spec:
  path: .ai/specs/2026-11-04-platform-quality-and-compliance.md
  ac: ["AC2"]
test:
  file: packages/app/tests/e2e/observability.e2e.test.ts
  it: "logs one line per API request with the route pattern and no query string or headers"
---

# ops-002-request-logs-one-line-without-query: An API request logs one line without query or headers

## Goal

Each API request leaves exactly one log line that cannot leak a session id, cookie or address.

## Given

1. The app runs and writes its output to a file.

## When

1. Request the public menu with a session id and a diet in the query, a session cookie and a forwarded address.

## Then

1. The log gains exactly one "api request" line with method, route pattern, status 200 and a duration.
2. The log contains neither the query values, nor the cookie value, nor the address.

## Edge cases covered

- Query string, cookie and X-Forwarded-For present on the request.

## Data and cleanup

- Nothing is written. The built app of the e2e run is started with a test-only metrics token. Plain HTTP, no browser.

## Test implementation

[packages/app/tests/e2e/observability.e2e.test.ts](../../../packages/app/tests/e2e/observability.e2e.test.ts): `logs one line per API request with the route pattern and no query string or headers`
