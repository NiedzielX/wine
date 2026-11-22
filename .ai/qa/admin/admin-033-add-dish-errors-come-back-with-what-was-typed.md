---
id: admin-033-add-dish-errors-come-back-with-what-was-typed
area: admin
title: "Add dish: wrong values come back with what was typed"
status: automated
spec:
  path: .ai/specs/2026-11-16-catalog-field-editing.md
  ac: ["AC16", "AC18"]
test:
  file: packages/app/tests/e2e/catalog-create.e2e.test.ts
  it: "A32 without JavaScript: \"58,500\", an empty name and a duplicate name come back with what was typed and a message at each field; nothing is created"
---

# admin-033-add-dish-errors-come-back-with-what-was-typed: Add dish: wrong values come back with what was typed

## Goal

A refused "Add dish" form shows every wrong field at once and keeps what was typed, and creates nothing.

## Given

1. The Wine Director signed in; JavaScript off; a dish named "Plum soufflé" exists.

## When

1. She sends the form with an empty name and the price 58,500, then with an existing name in another case.

## Then

1. The first answer says "Fill this in." and "Enter a number such as 58 or 58,50." and keeps the typed price; the second says another item already has this name and keeps the name.
2. The number of dishes is the same as before.

## Edge cases covered

- Names are compared by the import's key, so case and punctuation do not make a new dish.

## Data and cleanup

- Snapshot of the database before, restored after; the publish in the scenario is part of it.

## Test implementation

[packages/app/tests/e2e/catalog-create.e2e.test.ts](../../../packages/app/tests/e2e/catalog-create.e2e.test.ts): `A32 without JavaScript: "58,500", an empty name and a duplicate name come back with what was typed and a message at each field; nothing is created`
