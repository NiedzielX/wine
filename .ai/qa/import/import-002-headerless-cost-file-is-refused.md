---
id: import-002-headerless-cost-file-is-refused
area: import
title: "A file without a header that has a cost column is refused, not read in the default order"
status: automated
spec:
  path: none
  ac: []
test:
  file: packages/app/tests/e2e/import-cost-columns.e2e.test.ts
  it: "a file without a header that has a cost column is refused with 422 cost_without_header, and nothing of the file is echoed or stored"
---

# import-002-headerless-cost-file-is-refused: A file without a header that has a cost column is refused

## Goal
Without a recognised header the columns would be read in a default order and a cost column would become a price (T-44). The file is refused instead, and the refusal leaks nothing of the file.

## Given
1. The general manager of Halka is signed in.
2. A menu file `Potrawa;Cena;Koszt` / `Tarta;36;7777` and a wine file `Etykieta;Koszt;Cena` / `Riesling;7777;240`.

## When
1. The manager uploads each file to the import API.

## Then
1. Both answers are 422 with the code `cost_without_header`.
2. The bodies contain no cell text and no value (no 7777).
3. No import job is stored.

## Edge cases covered
- Menu and wine list. Title rows, two-row headers and data that only mention a cost word are covered by the unit tests (`import.test.ts`).

## Data and cleanup
- The test records the database first and puts it back at the end.

## Test implementation
[packages/app/tests/e2e/import-cost-columns.e2e.test.ts](../../../packages/app/tests/e2e/import-cost-columns.e2e.test.ts): the second `it`.
