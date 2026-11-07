---
id: security-004-showcase-is-read-only
area: security
title: "The showcase is read-only"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries.e2e.test.ts
  it: "T-03b: the showcase is read-only: a write method on /demo and a session-less write to the API change no row"
---

# security-004-showcase-is-read-only: The showcase is read-only

## Goal

The public calculator pages write nothing and set no cookie, whatever the method. (threat T-03, docs/security/threat-model.md).

## Given

1. The instance runs with `SHOWCASE_MODE=calculator`.

## When

1. The page `/demo/roi` is requested (positive control).
2. POST, PUT, PATCH and DELETE are sent to it.
3. A write to the API without a session is sent.

## Then

1. No method answers a server error and none sets a cookie; the unsigned API write answers 401 `unauthenticated`.
2. A digest of 12 tables is identical before and after.

## Edge cases covered

- Next.js answers a write method on a page with the page itself (200); that is accepted because nothing is written.

## Data and cleanup

- Writes nothing.

## Test implementation

[packages/app/tests/e2e/access-boundaries.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries.e2e.test.ts): `T-03b: the showcase is read-only: a write method on /demo and a session-less write to the API change no row`
