---
id: admin-031-add-a-dish-by-hand-without-javascript
area: admin
title: "Add a dish by hand: a draft, guests see it after a publish"
status: automated
spec:
  path: .ai/specs/implemented/2026-11-16-catalog-field-editing.md
  ac: ["AC16", "AC18"]
test:
  file: packages/app/tests/e2e/catalog-create.e2e.test.ts
  it: "A32 without JavaScript: \"Add dish\" creates a draft with the draft profile and engine suggestions, the flash says to check the profile, guests see it only after a publish, and an audit row names who"
---

# admin-031-add-a-dish-by-hand-without-javascript: Add a dish by hand: a draft, guests see it after a publish

## Goal

The Wine Director adds one dish with a plain form; it is a draft with a draft taste profile and engine suggestions, and guests see it only after a publish.

## Given

1. The Wine Director signed in; JavaScript off (the page as HTML, the form posted with its hidden fields).

## When

1. She opens the menu, follows "Add dish", types "Plum soufflé", a description, the category Desserts and the price 42,50, and sends the form.
2. She publishes.

## Then

1. The form leads to the new dish page with "Added. The taste profile is a draft: check it and confirm it."; the dish is a draft at 42.50 with a draft profile and engine suggestions only.
2. Before the publish the public menu does not list it and its guest page answers 404; the publish page lists it.
3. An audit row `create` names the Wine Director and her account and holds the typed fields.
4. After the publish the menu lists it and the guest page answers 200.

## Edge cases covered

- The price comma is read as in the edit form.

## Data and cleanup

- Snapshot of the database before, restored after; the publish in the scenario is part of it.

## Test implementation

[packages/app/tests/e2e/catalog-create.e2e.test.ts](../../../packages/app/tests/e2e/catalog-create.e2e.test.ts): `A32 without JavaScript: "Add dish" creates a draft with the draft profile and engine suggestions, the flash says to check the profile, guests see it only after a publish, and an audit row names who`
