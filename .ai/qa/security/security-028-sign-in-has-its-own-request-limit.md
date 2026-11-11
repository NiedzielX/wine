---
id: security-028-sign-in-has-its-own-request-limit
area: security
title: "Sign-in has its own request limit"
status: automated
spec:
  path: .ai/specs/2026-11-04-platform-quality-and-compliance.md
  ac: ["AC7"]
test:
  file: packages/app/tests/e2e/rate-limits.e2e.test.ts
  it: "sign-in has its own counter: a client over the public-API limit signs in, and over the login limit gets 429"
---

# security-028-sign-in-has-its-own-request-limit: Sign-in has its own request limit

## Goal

Exhausting the guest API limit does not lock a client out of sign-in, and sign-in itself is limited separately.

## Given

1. The same app; the sign-in limit is 2 attempts per 10 minutes (test setting).
2. The client has already gone over the public-API limit.

## When

1. The client sends three sign-in requests with an empty body.

## Then

1. The first two answers are 422 (the body is refused before any account is looked up).
2. The third is 429 with a positive `Retry-After`.

## Edge cases covered

- Every attempt counts, whatever its outcome.
- No account row is touched (empty body).

## Data and cleanup

- A second built app on the shared e2e database with test-only limits, one trusted proxy hop and a test-only secret; client addresses from TEST-NET-3. At the end the whole counter table is restored from the snapshot taken at the start and checked to be exactly as found; this assumes no other process uses the limiter on that database while the file runs (the shared e2e app is idle: files run one at a time). Plain HTTP, no browser.

## Test implementation

[packages/app/tests/e2e/rate-limits.e2e.test.ts](../../../packages/app/tests/e2e/rate-limits.e2e.test.ts): `sign-in has its own counter: a client over the public-API limit signs in, and over the login limit gets 429`
