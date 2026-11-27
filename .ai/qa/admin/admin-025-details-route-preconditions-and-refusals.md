---
id: admin-025-details-route-preconditions-and-refusals
area: admin
title: "Details API: If-Match, conflict, schema and id refusals"
status: automated
spec:
  path: .ai/specs/implemented/2026-11-16-catalog-field-editing.md
  ac: ["AC11"]
test:
  file: packages/app/tests/e2e/catalog-edit.e2e.test.ts
  it: "PATCH …/details answers 428 without If-Match, 409 with a stale one, 422 for an empty body and a field outside the schema, 404 for an id that is not a UUID; the ETag is the new fingerprint"
---

# admin-025-details-route-preconditions-and-refusals: Details API: If-Match, conflict, schema and id refusals

## Goal

The REST route for editing a dish needs the version the caller read and refuses everything else with the right status.

## Given

1. The Wine Director signed in; the fingerprint of the dish read from the ETag of the GET.

## When

1. She sends PATCH without If-Match, with a malformed one, with an empty body, with a field outside the schema, for an id that is not a UUID, with a stale version, and finally correctly.

## Then

1. The answers are 428, 400, 422, 422, 404 and 409 in that order and no audit row is written.
2. The correct one answers 200 with the new fields and a new ETag; the price is stored.
3. The availability route of the wine answers as before.

## Edge cases covered

- Stale and unknown ids never write.

## Data and cleanup

- Snapshot of the database before, restored after.

## Test implementation

[packages/app/tests/e2e/catalog-edit.e2e.test.ts](../../../packages/app/tests/e2e/catalog-edit.e2e.test.ts): `PATCH …/details answers 428 without If-Match, 409 with a stale one, 422 for an empty body and a field outside the schema, 404 for an id that is not a UUID; the ETag is the new fingerprint`
