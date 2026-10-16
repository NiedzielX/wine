---
date: 2026-10-14
updated: 2026-10-16
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
- `engine:matrix` pokazuje tylko `pairingScore`. Warstwę rankingu (tiery, „Najlepsza cena”, budżet, stolik) pilnuje test złoty `packages/core/tests/engine-golden.test.ts`: refaktor bez zmiany wyników = migawki bez zmian; świadoma zmiana wyników = `-u`, przegląd diffu i nowa `ENGINE_VERSION`. (2026-10-16, `.ai/runs/2026-10-16-e07-f1a-engine-facts.md`)
- Migawka chroni tylko to, czego dotykają dane: sprawdź ją mutacją (zmień stałą, test musi paść, przywróć). Na danych demo zmiana `TABLE_REJECTED_CAP` przechodziła niezauważona, bo jedyna odrzucona para miała wynik poniżej limitu — potrzebny był osobny scenariusz.
- Zmiana wag i progów wymaga specyfikacji (patrz `AGENTS.md`, sekcja 3) i aktualizacji tabeli reguł w `docs/RECOMMENDATION_ENGINE.md`.

## Jak sprawdzić
`npm run engine:matrix` (top 5) lub `npm run engine:matrix -- 8`. Skrypt: `packages/core/scripts/engine-matrix.ts`. Ranking: `npx vitest run tests/engine-golden.test.ts` w `packages/core`.
