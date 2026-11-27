---
id: admin-022-wrong-price-and-empty-name-come-back-with-what-was-typed
area: admin
title: "Dish and wine forms: wrong values come back with what was typed"
status: automated
spec:
  path: .ai/specs/implemented/2026-11-16-catalog-field-editing.md
  ac: ["AC8"]
test:
  file: packages/app/tests/e2e/catalog-edit.e2e.test.ts
  it: "A3 and A5 without JavaScript: \"58,500\", \"1.234\", \"abc\" and an empty name come back with what was typed and a message at each field, and nothing is written; an unticked box saves no glass price"
---

# admin-022-wrong-price-and-empty-name-come-back-with-what-was-typed: Dish and wine forms: wrong values come back with what was typed

## Goal

A form that cannot be saved comes back with every value as typed and a message at each wrong field, and writes nothing.

## Given

1. The Wine Director of Halka; a dish and a wine with a glass price.

## When

1. She posts the dish form with the price "58,500", then "1.234", then "abc" together with an empty name.
2. She posts the wine form with the glass price typed but the "Poured by the glass" box unticked, then ticked with a glass price above the bottle price, then ticked with 12,5.

## Then

1. Each refused post answers with the form again: the typed value is still in its field, the price says it is not a number (the empty name says to fill it in), the wrong fields are marked invalid.
2. The dish and the audit table are exactly as before.
3. The unticked box saves "no glass price" without an error; a glass price at or above the bottle is refused at that field; 12,5 is saved as 12.50.

## Edge cases covered

- "58,500" and "1.234" are not read as thousands.

## Data and cleanup

- Snapshot of the database before, restored after.

## Test implementation

[packages/app/tests/e2e/catalog-edit.e2e.test.ts](../../../packages/app/tests/e2e/catalog-edit.e2e.test.ts): `A3 and A5 without JavaScript: "58,500", "1.234", "abc" and an empty name come back with what was typed and a message at each field, and nothing is written; an unticked box saves no glass price`
