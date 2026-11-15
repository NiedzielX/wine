---
id: security-031-rate-limit-table-holds-only-keyed-hashes
area: security
title: "The rate-limit table holds only keyed hashes"
status: automated
spec:
  path: .ai/specs/2026-11-04-platform-quality-and-compliance.md
  ac: ["AC5", "AC6"]
test:
  file: packages/app/tests/e2e/rate-limits.e2e.test.ts
  it: "the counter table holds keyed hashes only: no client address, one row per client, rule and window"
---

# security-031-rate-limit-table-holds-only-keyed-hashes: The rate-limit table holds only keyed hashes

## Goal

The shared counter table never stores a client's IP address.

## Given

1. The previous scenarios of this file made requests from several test addresses.

## When

1. Read the rows of `rate_limit_bucket` written by this run.

## Then

1. Every key is 32 hexadecimal characters and equals the keyed daily hash of one of the test addresses.
2. No key contains an address.
3. The first client's public-API row counts exactly 4 hits (3 allowed + 1 refused).

## Edge cases covered

- The same address hashes to another key on another day (unit test).

## Data and cleanup

- A second built app on the shared e2e database with test-only limits, one trusted proxy hop and a test-only secret; client addresses from TEST-NET-3. At the end the whole counter table is restored from the snapshot taken at the start and checked to be exactly as found; this assumes no other process uses the limiter on that database while the file runs (the shared e2e app is idle: files run one at a time). Plain HTTP, no browser.

## Test implementation

[packages/app/tests/e2e/rate-limits.e2e.test.ts](../../../packages/app/tests/e2e/rate-limits.e2e.test.ts): `the counter table holds keyed hashes only: no client address, one row per client, rule and window`
