---
id: security-029-spoofed-forwarded-addresses-do-not-reset-the-counter
area: security
title: "Spoofed forwarded addresses do not reset the counter"
status: automated
spec:
  path: .ai/specs/2026-11-04-platform-quality-and-compliance.md
  ac: ["AC7"]
test:
  file: packages/app/tests/e2e/rate-limits.e2e.test.ts
  it: "only the address appended by the trusted proxy counts: addresses a client writes in front of it do not give a new counter"
---

# security-029-spoofed-forwarded-addresses-do-not-reset-the-counter: Spoofed forwarded addresses do not reset the counter

## Goal

A client cannot escape the limit by writing fake addresses into X-Forwarded-For.

## Given

1. One trusted proxy hop: only the right-most address (the one the proxy appended) identifies the client.

## When

1. The same real client sends four menu requests, each with a different made-up address in front of its own.

## Then

1. The first three are 200; the fourth is 429.

## Edge cases covered

- The default (no trusted proxy) ignores the header completely; that case is covered by unit tests (`packages/app/tests/unit/rate-limits.test.ts`).

## Data and cleanup

- A second built app on the shared e2e database with test-only limits, one trusted proxy hop and a test-only secret; client addresses from TEST-NET-3. The counter rows of this file are deleted at the end and the table is checked to be exactly as found. Plain HTTP, no browser.

## Test implementation

[packages/app/tests/e2e/rate-limits.e2e.test.ts](../../../packages/app/tests/e2e/rate-limits.e2e.test.ts): `only the address appended by the trusted proxy counts: addresses a client writes in front of it do not give a new counter`
