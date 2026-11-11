---
id: security-030-staff-code-lookup-over-limit-says-too-many-attempts
area: security
title: "Staff code lookup over the limit says too many attempts"
status: automated
spec:
  path: .ai/specs/2026-11-04-platform-quality-and-compliance.md
  ac: ["AC8"]
test:
  file: packages/app/tests/e2e/rate-limits.e2e.test.ts
  it: "the staff view answers \"too many attempts\" over the code-lookup limit, also for traffic marked synthetic"
---

# security-030-staff-code-lookup-over-limit-says-too-many-attempts: Staff code lookup over the limit says too many attempts

## Goal

Guessing recommendation codes on the staff view G9 is limited, and the answer does not say whether a code exists.

## Given

1. The code-lookup limit is 1 per 10 minutes (test setting).
2. Requests carry the synthetic-traffic header (no usage events are written).

## When

1. The client looks up the unknown code ZZZ twice on `/r/halka/staff`.

## Then

1. The first page says there is no code ZZZ today.
2. The second page says there were too many attempts from this network and does NOT say "no code".

## Edge cases covered

- The synthetic-traffic header does not bypass the limit (a client could forge it).

## Data and cleanup

- A second built app on the shared e2e database with test-only limits, one trusted proxy hop and a test-only secret; client addresses from TEST-NET-3. The counter rows of this file are deleted at the end and the table is checked to be exactly as found. Plain HTTP, no browser.

## Test implementation

[packages/app/tests/e2e/rate-limits.e2e.test.ts](../../../packages/app/tests/e2e/rate-limits.e2e.test.ts): `the staff view answers "too many attempts" over the code-lookup limit, also for traffic marked synthetic`
