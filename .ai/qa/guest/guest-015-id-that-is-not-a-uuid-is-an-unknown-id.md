---
id: guest-015-id-that-is-not-a-uuid-is-an-unknown-id
area: guest
title: "An id that is not a UUID is an unknown id"
status: automated
spec:
  path: docs/API_SPECIFICATION.md
  ac: ["GET /dishes/{id}/recommendations: unknown resource is 404"]
test:
  file: packages/app/tests/e2e/unknown-ids.e2e.test.ts
  it: "answers 404 on the guest pages and the public API for a dish or wine id that is not a UUID"
---

# guest-015-id-that-is-not-a-uuid-is-an-unknown-id: An id that is not a UUID is an unknown id

## Goal

A typo, a cut-off link or a scraper sending a dish or wine id that is not a UUID gets "not found", never a server error.

## Given

1. The built app on PostgreSQL with the demo restaurant Halka; nobody is signed in.

## When

1. The guest opens `/r/halka/wine/abc`, `/r/halka/dish/abc/wines` and `/r/halka/selected/abc`.
2. A client calls `GET /api/v1/dishes/abc/recommendations?restaurant=halka`.

## Then

1. All four answers have HTTP status 404 (before the fix they were 500).

## Edge cases covered

- A non-UUID id on every public lookup by dish or wine id.
- A well-formed unknown id (404) and a real dish (200) are covered by guest-013 and the landing scenarios.

## Data and cleanup

- Plain HTTP requests; no real browser is started. Read-only, nothing to clean up.

## Test implementation

[packages/app/tests/e2e/unknown-ids.e2e.test.ts](../../../packages/app/tests/e2e/unknown-ids.e2e.test.ts): `answers 404 on the guest pages and the public API for a dish or wine id that is not a UUID`
