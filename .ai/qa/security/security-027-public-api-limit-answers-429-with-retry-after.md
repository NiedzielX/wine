---
id: security-027-public-api-limit-answers-429-with-retry-after
area: security
title: "Public API over the limit answers 429 with Retry-After"
status: automated
spec:
  path: .ai/specs/2026-11-04-platform-quality-and-compliance.md
  ac: ["AC7"]
test:
  file: packages/app/tests/e2e/rate-limits.e2e.test.ts
  it: "public API: below the limit passes, over it 429 with Retry-After and no-store; another client and the health check are not affected"
---

# security-027-public-api-limit-answers-429-with-retry-after: Public API over the limit answers 429 with Retry-After

## Goal

A client that floods the public guest API is slowed down with a clear 429, without affecting other clients or the health check.

## Given

1. The app runs behind one trusted proxy hop with a public-API limit of 3 requests per minute (test setting).
2. Each client is told apart by the address the proxy appends.

## When

1. One client asks for the Halka menu four times in a row.
2. Another client asks once.
3. The first client calls the health check five times.

## Then

1. The first three answers are 200; the fourth is 429 with the error code `rate_limited`, a `Retry-After` between 1 and 60 seconds and `Cache-Control: no-store`.
2. The other client gets 200.
3. Every health check answers 200.

## Edge cases covered

- A refused answer must not be cached by a CDN (no-store).

## Data and cleanup

- A second built app on the shared e2e database with test-only limits, one trusted proxy hop and a test-only secret; client addresses from TEST-NET-3. The counter rows of this file are deleted at the end and the table is checked to be exactly as found. Plain HTTP, no browser.

## Test implementation

[packages/app/tests/e2e/rate-limits.e2e.test.ts](../../../packages/app/tests/e2e/rate-limits.e2e.test.ts): `public API: below the limit passes, over it 429 with Retry-After and no-store; another client and the health check are not affected`
