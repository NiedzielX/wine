---
id: security-022-write-bodies-with-foreign-fields-are-refused
area: security
title: "Write requests with fields a client must not set are refused whole"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries-writes.e2e.test.ts
  it: "T-35: every JSON write route refuses fields outside its schema (422, top level and nested) and writes nothing; the same body without them works (positive control)"
---

# security-022-write-bodies-with-foreign-fields-are-refused: Write requests with fields a client must not set are refused whole

## Goal

No API write lets a client set the restaurant, id, role, status, author, version or publish flags of a record (mass assignment, threat T-35).

## Given

1. Marta, Tomasz (Halka) and Anna (Bistro owner) are signed in; Halka has an open wine import.

## When

1. Each JSON write (wine availability, pairing create and change, bulk decision, invitation, team change, import rows and confirm, table recommendations) is sent with `restaurantId`, `id`, `role`, `status`, `createdBy`, `version`, `published`, `approved` and similar fields: all together, nested where the body has objects, and one at a time.
2. The same body without them is sent (positive control).
3. Sign-in is sent with a right password and the same extra fields.

## Then

1. Every body with an extra field is answered 422 `validation_failed`, and no table changes.
2. The clean body works (200 or 201).
3. Sign-in with extra fields is refused: no cookie, nothing written.

## Edge cases covered

- Mutation proof recorded in the run log (`.ai/runs/2026-11-09-boundaries-part2.md`).

## Data and cleanup

- The file records the whole database first and puts it back in `afterAll`.

## Test implementation

[packages/app/tests/e2e/access-boundaries-writes.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries-writes.e2e.test.ts): `T-35: every JSON write route refuses fields outside its schema (422, top level and nested) and writes nothing; the same body without them works (positive control)`
