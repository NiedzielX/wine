---
id: admin-021-dish-price-saved-without-javascript-and-live-for-guests
area: admin
title: "Dish details: a price saved without JavaScript is live for guests"
status: automated
spec:
  path: .ai/specs/implemented/2026-11-16-catalog-field-editing.md
  ac: ["AC7", "AC8", "AC12"]
test:
  file: packages/app/tests/e2e/catalog-edit.e2e.test.ts
  it: "A3 without JavaScript: a price typed as 58,50 is saved, guests see the dish name and price at once, the unpublished counter stays and the audit row names who"
---

# admin-021-dish-price-saved-without-javascript-and-live-for-guests: Dish details: a price saved without JavaScript is live for guests

## Goal

The Wine Director edits the name, description and price of a dish with a plain form; guests see the change at once, the unpublished counter does not move and the change is on record with its author.

## Given

1. Halka is signed in as its Wine Director; the dish "Duck breast" has sommelier pairings and a published Polish translation.

## When

1. She opens the dish page, types "58,50" as the price, a new name and a two-line description, confirms the rename and saves, with JavaScript off.

## Then

1. The browser is redirected back to the dish page with the saved message.
2. The stored price is 58.50, the name and description are the typed ones, the line break is kept as one line feed.
3. The public menu and the guest dish page show the new name and price without a publish; a Polish guest still reads the Polish translation of the last publish.
4. The number of unpublished changes is the same as before.
5. There is one audit row with only the changed fields, the author and the account; the Wine Director sees the date of the last edit, the General Manager sees the name too.

## Edge cases covered

- A decimal comma is read as a decimal point.
- A rename of a dish with pairings is flagged as an identity change in the audit row.

## Data and cleanup

- Snapshot of the database before, restored after.

## Test implementation

[packages/app/tests/e2e/catalog-edit.e2e.test.ts](../../../packages/app/tests/e2e/catalog-edit.e2e.test.ts): `A3 without JavaScript: a price typed as 58,50 is saved, guests see the dish name and price at once, the unpublished counter stays and the audit row names who`
