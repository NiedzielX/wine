---
id: import-001-cost-column-never-becomes-a-price
area: import
title: "A purchase-cost column is never imported as a price"
status: automated
spec:
  path: none
  ac: []
test:
  file: packages/app/tests/e2e/import-cost-columns.e2e.test.ts
  it: "a menu and a wine list with \"Cena zakupu netto\" before the price column: the preview warns, the prices are the price column, and the cost reaches nobody"
---

# import-001-cost-column-never-becomes-a-price: A purchase-cost column is never imported as a price

## Goal
An owner's spreadsheet with a purchase-cost column ("Cena zakupu netto") placed before the price column is imported with the price from the "Cena" column, and the cost price never reaches guests, the stored rows, the published version or the log.

## Given
1. The general manager of Halka is signed in.
2. A menu file (`menu-purchase-cost.csv`) with the columns Kategoria, Danie, Opis, "Cena zakupu netto", Cena, and a wine file (`wines-purchase-cost.csv`) with "Cena zakupu netto" before "Cena butelka". The cost of the first row of each file is 7777,77.

## When
1. The manager uploads the menu file and the wine file, opens the preview of the menu, confirms both imports and publishes.
2. A guest opens the public menu API and the guest pages of the restaurant.

## Then
1. Both previews answer 201 with the prices of the price column (36 and 112 for the dishes; 240 and 220 for the bottles; no glass price) and the note "Cost columns skipped, never read as a price: Cena zakupu netto."
2. The preview page names the skipped column; no answer and no stored import row contains 7777.
3. After the confirmation the dishes cost 36 and 112 and the wines 240 and 220; no dish or wine has a price above 7000.
4. After the publish the public menu API shows 36 and 112; the guest pages and the published snapshot contain no 7777.
5. The application log contains neither 7777,77 nor 7777.77.
6. A file without a header whose columns include a cost (`Potrawa;Cena;Koszt`, wines `Etykieta;Koszt;Cena`) is uploaded: the answer is 422 `cost_without_header`, the body names no cell and no value, and no import job is stored.

## Edge cases covered
- The cost column is first in the file (before the price column).
- Menu and wine list are both checked.
- The mapping of 17 cost headers, an only-cost file and plain price headers are covered by the unit tests (`import.test.ts`, `import-cost-columns.test.ts`), not by this scenario.

## Data and cleanup
- The test records the database first and puts it back at the end. The dishes and wines of the files have names no demo item has.

## Test implementation
The 422 refusal of a headerless file with a cost column is the second `it` of the same file (step 6).
[packages/app/tests/e2e/import-cost-columns.e2e.test.ts](../../../packages/app/tests/e2e/import-cost-columns.e2e.test.ts): `a menu and a wine list with "Cena zakupu netto" before the price column: the preview warns, the prices are the price column, and the cost reaches nobody`
