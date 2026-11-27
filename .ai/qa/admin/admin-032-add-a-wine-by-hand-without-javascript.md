---
id: admin-032-add-a-wine-by-hand-without-javascript
area: admin
title: "Add a wine by hand: next number, draft profile, visible after a publish"
status: automated
spec:
  path: .ai/specs/implemented/2026-11-16-catalog-field-editing.md
  ac: ["AC17", "AC18"]
test:
  file: packages/app/tests/e2e/catalog-create.e2e.test.ts
  it: "A32 without JavaScript: \"Add wine\" takes the next list number, saves no glass price for an unticked box, gives the wine a draft profile, and guests see it only after a publish"
---

# admin-032-add-a-wine-by-hand-without-javascript: Add a wine by hand: next number, draft profile, visible after a publish

## Goal

The Wine Director adds one wine with a plain form; it takes the next free list number, gets a draft taste profile and engine suggestions, and guests see it only after a publish.

## Given

1. The Wine Director and the General Manager signed in; JavaScript off.

## When

1. She sends the wine form with a typed glass price but the glass box unticked, no list number, the style White and the grape Riesling.
2. She adds a second wine with the box ticked, a glass price and the number 5000, then a third with the number 5000 again.
3. The General Manager publishes.

## Then

1. The first wine is active, numbered after the highest number, has no glass price, the style white with a `grape_defaults` profile and engine suggestions.
2. The second keeps its glass price and number 5000; the third comes back refused with what was typed and nothing written.
3. Before the publish the wine page for guests answers 404, after it 200.

## Edge cases covered

- An explicit number that is free is kept; a taken one is refused at the field.

## Data and cleanup

- Snapshot of the database before, restored after; the publish in the scenario is part of it.

## Test implementation

[packages/app/tests/e2e/catalog-create.e2e.test.ts](../../../packages/app/tests/e2e/catalog-create.e2e.test.ts): `A32 without JavaScript: "Add wine" takes the next list number, saves no glass price for an unticked box, gives the wine a draft profile, and guests see it only after a publish`
