---
started: 2026-10-25 10:40
ended: 2026-10-25 12:30
agent: Claude Code
spec: brak — poprawka zgodna z istniejącą specyfikacją (E03 Q18/R9, recommendation-code R8)
outcome: success
related: [.ai/runs/2026-10-21-e09-f3-pos-code-matching.md]
---

# Import POS nie zapisuje nazwy pozycji (issue #90)

## Zadanie
Issue #90 (z PR #88): `itemName` z pliku sprzedaży trafiał do `import_job.rows`, mimo że E03 Q18/R9 mówi, że nazwy pozycji nie są przechowywane. Poprawka z testem, który najpierw pada.

## Przebieg
- `mapSalesTable` (`packages/core/src/import/mapping.ts`) przepisywał `itemName` do rekordu, a rekord trafia do `import_job.rows`. Podgląd czyta wiersze z zapisanego zadania, więc nazwy nie da się ukryć tylko w podglądzie. Wybrane rozwiązanie z issue: nazwa nie trafia do rekordu wcale. Nagłówek kolumny i kod wpisany w całą komórkę pozycji nadal są rozpoznawane (R8), tylko przy mapowaniu.
- Usunięta kolumna „Item” z tabeli podglądu importu (`import-screen.tsx`). Konsekwencja: podgląd nie pokazuje już nazwy pozycji; widać typ, ilość i kwotę.
- Test najpierw: `sales-import.test.ts` (core i db) oczekuje braku `itemName`. Na starym kodzie 1 test pada (potwierdzone przez `git stash` tylko na `mapping.ts`).
- Dokumentacja: `docs/DATA_MODEL.md` (zdanie o nazwie pozycji), `docs/SCREEN_SPECIFICATION.md` (tabela podglądu importu).

## Weryfikacja
- `npm run lint`, `npm run check:boundaries`, `npm run typecheck`: zielone.
- `npm test` (wszystkie pakiety): 565 + 49 + 62 + 353 + 10 testów, bez błędów.
- `npm run test:db` z lokalnym PostgreSQL 16 (`TEST_DATABASE_URL`, bez Dockera): 102 testy zielone.
- `npm run build`: zielone (exit 0).
- Nie sprawdzono ekranu podglądu importu przy 390 px i 1440 px w przeglądarce (zmiana to usunięcie jednej kolumny; testy jednostkowe panelu przechodzą).

## Wynik
Poprawka gotowa na gałęzi `fix/issue-90-pos-item-name`, bez PR. Brak migracji (schemat się nie zmienia).
Dług techniczny: sprawdzić podgląd importu w przeglądarce przy 390 px i 1440 px (nie zrobione).

## Lekcje
Patrz `.ai/lessons/2026-10-25-import-preview-reads-saved-rows.md`.
