---
id: admin-034-create-routes-answer-201-and-refuse-bad-bodies
area: admin
title: "Create API: 201 with Location and ETag, refusals write nothing"
status: automated
spec:
  path: .ai/specs/2026-11-16-catalog-field-editing.md
  ac: ["AC16", "AC17"]
test:
  file: packages/app/tests/e2e/catalog-create.e2e.test.ts
  it: "answer 201 with Location and ETag, 422 for missing, wrong and extra fields (nothing written), 422 for a duplicate; the Location is the details route"
---

# admin-034-create-routes-answer-201-and-refuse-bad-bodies: Create API: 201 with Location and ETag, refusals write nothing

## Goal

The REST routes that add a dish and a wine answer 201 with where to find the new item and refuse every wrong body without writing.

## Given

1. The Wine Director signed in.

## When

1. She posts an empty dish body, a dish with a status, a wine with a year too far ahead, and a dish without the restaurant query; then a valid dish, a duplicate of it, and a valid wine.

## Then

1. The refusals answer 422 (the empty body names every required field) and no audit row is written.
2. The valid dish answers 201 with `Location` of its details and the same `ETag` as that details route; the duplicate is `validation_failed`.
3. The valid wine answers 201 with `Location`, `ETag` and the list number it got.

## Edge cases covered

- A missing `restaurant` query is a 422, never a write.

## Data and cleanup

- Snapshot of the database before, restored after; the publish in the scenario is part of it.

## Test implementation

[packages/app/tests/e2e/catalog-create.e2e.test.ts](../../../packages/app/tests/e2e/catalog-create.e2e.test.ts): `answer 201 with Location and ETag, 422 for missing, wrong and extra fields (nothing written), 422 for a duplicate; the Location is the details route`
