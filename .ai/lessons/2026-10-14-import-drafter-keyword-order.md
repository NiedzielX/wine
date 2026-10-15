---
date: 2026-10-14
updated:
area: import
status: active
source: .ai/runs/2026-10-14-mvp-mockups.md
---

# Drafter importu dopasowuje słowa kluczowe w kolejności listy — konstrukcje „X steak” muszą być przed mięsem

## Kontekst
Przy imporcie pliku przykładowego danie „Grilled cauliflower steak” dostało profil `protein: beef, intensity: 5`, a więc rekomendacje jak do steku wołowego.

## Przyczyna
`draftDishProfile` w `packages/core/src/engine/drafts.ts` bierze pierwsze trafienie z `PROTEIN_WORDS`. Słowo „steak” jest w regule dla wołowiny, a warzywo nie miało wcześniejszej, bardziej szczegółowej reguły.

## Reguła
- Reguły bardziej szczegółowe (frazy wielowyrazowe, np. `cauliflower steak`, `celeriac steak`) umieszczaj w `PROTEIN_WORDS` **przed** ogólnymi.
- Każdy nowy przypadek pomyłki draftera dodawaj jako test w `packages/core/tests/engine.test.ts` (sekcja „import drafting edge cases”).
- Pamiętaj, że profil z importu ma zawsze `source: draft` — pomyłka jest do wyłapania w podglądzie importu, ale nie zakładaj, że ktoś ją wyłapie.

## Jak sprawdzić
`npm test` — test „treats a vegetable "steak" as vegetable, not beef”.
