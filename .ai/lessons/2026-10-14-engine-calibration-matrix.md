---
date: 2026-10-14
updated: 2026-10-14
area: engine
status: active
source: .ai/runs/2026-10-14-mvp-mockups.md
---

# Po każdej zmianie reguł silnika przejrzyj pełną macierz dań × win, nie tylko testy

## Kontekst
Podczas pierwszej kalibracji testy przechodziły, a mimo to silnik dawał wyniki, które sommelier od razu by odrzucił: Tokaji i Porto w top 5 do kaczki, wytrawny szampan do sernika, Chardonnay z beczki 78% do steku 45-dniowego, Zinfandel wyżej niż Pinot Noir do kaczki.

## Przyczyna
Testy jednostkowe sprawdzają pojedyncze reguły, a błędy kalibracji wynikają z interakcji reguł (np. zbyt surowa kara za różnicę wagi, brak tolerancji na lekką słodycz sosu, premia za kwasowość przy winach o średniej kwasowości).

## Reguła
- Po każdej zmianie w `packages/core/src/engine/scoring.ts` wypisz top 5 win dla każdego dania z danych demonstracyjnych i przejrzyj je oczami sommeliera, zanim uznasz zmianę za gotową.
- Każdą znalezioną anomalię zamień w test (np. „keeps dessert wine away from savoury mains”), a dopiero potem poprawiaj regułę.
- Zmiana wag i progów wymaga specyfikacji (patrz `AGENTS.md`, sekcja 3) i aktualizacji tabeli reguł w `docs/RECOMMENDATION_ENGINE.md`.

## Jak sprawdzić
`npm run engine:matrix` (top 5) lub `npm run engine:matrix -- 8`. Skrypt: `packages/core/scripts/engine-matrix.ts`.
