---
date: 2026-11-17
updated:
area: catalog
status: active
source: .ai/runs/2026-11-17-catalog-field-editing-c1.md
promoted:
---

# Edycja pól: schemat ciała sprawdza tylko typy, reguły treści działają po odjęciu pól równych zapisanym

## Kontekst
Formularz A3/A5 zawsze wysyła pełny stan. Wartość zapisana przez import, która łamie nową regułę (opis 1500 znaków, import nie ma limitu), nie może blokować edycji innego pola (spec `2026-11-16-catalog-field-editing`, R1). Jednocześnie `check:routes` i test odporności tras (`api-robustness.test.ts`) wymagają, by wartość złego typu dawała 422 także dla nieznanego id (przed 404).

## Reguła
- Trasa i `CatalogEditService` najpierw czytają ciało przez `dishShapeSchema` / `wineShapeSchema` (nazwy i typy, co najmniej jedno pole), potem serwis znajduje pozycję (404), odejmuje pola równe zapisanym (`pruneUnchanged`, z `\r\n` = `\n`; para „szklanka” jest zawsze sprawdzana na stanie po scaleniu) i dopiero wtedy stosuje reguły treści (`dishFieldsSchema`, `wineFieldsSchema`). Błędy typu i błędy treści nie łączą się w jedną odpowiedź.
- Formularz, który sam wie, że pole jest złe (cena „abc”), wycina je z wejścia i woła serwis z `validateOnly`, żeby reszta nie została zapisana, a błędy pozostałych pól wróciły razem z własnym kodem pola.
- Akcja `useActionState` wysłana ręcznie (bez związanego stanu) dostaje formularz jako pierwszy argument: `formOf(previous, posted)`, inaczej 500.

## Jak sprawdzić
`catalog-edit-service.test.ts` („stored value that breaks the new rules”), `catalog-editing.test.ts` (cena „abc” z drugą zmianą nic nie zapisuje), `catalog-edit.e2e.test.ts` (akcje wysłane ręcznie, bez 500).
