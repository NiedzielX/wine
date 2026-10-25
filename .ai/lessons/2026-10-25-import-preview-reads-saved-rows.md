---
date: 2026-10-25
updated:
area: import
status: active
source: .ai/runs/2026-10-25-pos-item-name-privacy.md
promoted:
---

# Podgląd importu czyta zapisane wiersze, więc pole, którego nie wolno przechowywać, nie może trafić do wiersza wcale

## Kontekst
Issue #90: nazwa pozycji z pliku POS była pokazywana w podglądzie i jednocześnie trafiała do `import_job.rows`, czyli do bazy. E03 Q18/R9 zabraniają jej zapisu.

## Przyczyna
Podgląd po odświeżeniu strony jest renderowany z `import_job.rows` (jedyne miejsce, gdzie wiersze żyją między żądaniami; plik nie jest przechowywany). Każde pole widoczne w podglądzie jest więc zapisane.

## Reguła
Pole, którego nie wolno zapisać, nie wchodzi do rekordu importu, nawet jeśli ma być tylko podglądowe. Rozpoznawanie (nagłówek, kod w całej komórce) działa przy mapowaniu, a rekord zawiera wyłącznie pola z listy zapisywanych.

## Jak sprawdzić
`packages/core/tests/sales-import.test.ts`: rekordy nie mają `itemName`. `packages/db/tests/sales-import.test.ts`: JSON wierszy zadania nie zawiera nazwy pozycji z fixture.
