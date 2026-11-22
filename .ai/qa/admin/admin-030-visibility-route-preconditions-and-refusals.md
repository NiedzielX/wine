---
id: admin-030-visibility-route-preconditions-and-refusals
area: admin
title: "Visibility API: If-Match, conflict, schema, transition and id refusals"
status: automated
spec:
  path: .ai/specs/2026-11-16-catalog-field-editing.md
  ac: ["AC14", "AC15"]
test:
  file: packages/app/tests/e2e/catalog-visibility.e2e.test.ts
  it: "answers 428 without If-Match, 400 malformed, 422 for a wrong body, 404 for a non-UUID, 409 stale and 422 transition; the ETag is the new fingerprint; showing a shown dish is refused"
---

# admin-030-visibility-route-preconditions-and-refusals: Visibility API: If-Match, conflict, schema, transition and id refusals

## Goal

The REST route that hides and shows a dish needs the version the caller read and refuses everything else with the right status.

## Given

1. The Wine Director signed in; the fingerprint of the dish read from the ETag of the GET.

## When

1. She sends POST without If-Match, with a malformed one, with an empty body, with a field outside the schema, for an id that is not a UUID, with a stale version, for the state the dish is already in, for a draft dish, and finally correctly.

## Then

1. The answers are 428, 400, 422, 422, 404, 409, 422 (transition), 422 (transition) in that order and no audit row is written.
2. The correct one answers 200 with the status and a new ETag equal to the one the next GET returns; showing the dish again answers 200.

## Edge cases covered

- Stale and unknown ids never write.

## Data and cleanup

- Snapshot of the database before, restored after.

## Test implementation

[packages/app/tests/e2e/catalog-visibility.e2e.test.ts](../../../packages/app/tests/e2e/catalog-visibility.e2e.test.ts): `answers 428 without If-Match, 400 malformed, 422 for a wrong body, 404 for a non-UUID, 409 stale and 422 transition; the ETag is the new fingerprint; showing a shown dish is refused`
