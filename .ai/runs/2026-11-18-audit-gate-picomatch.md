---
started: 2026-11-18 15:20
ended: 2026-11-18 15:40
agent: Claude Code
spec: brak — poprawka bramki CI (lekcja o nowych advisories)
outcome: success
related: [.ai/lessons/2026-10-25-audit-gate-new-advisories.md]
---

# Nowy advisory `picomatch` czerwieni job `lint` na wszystkich PR-ach

## Zadanie
Job `lint` (krok `audit:gate`) padał na #171 i #172, choć zmieniały tylko dokumentację i testy: `picomatch` (high, GHSA-fc5q-39xc-vjpf, ReDoS przez powtarzane extglob) w zakresie `<=4.0.7`.

## Przebieg
`npm audit --omit=dev`: podatna jest tylko zagnieżdżona kopia `picomatch@2.3.2` pod `micromatch` (`awilix → fast-glob → micromatch`). Poprawionego wydania nie ma (najnowsze `4.0.7` jest w zakresie), więc bump odpada. Ta sama osiągalność co w istniejącym wyjątku dla `braces`: `container.ts` rejestruje wszystko ręcznie, wzorce glob nie są nigdy wyliczane. Dodany dateowany wyjątek dla nazwanego advisory (do 2027-01-15).

## Weryfikacja
`npm run audit:gate`: przed — „FAILED (1): picomatch (high)”, po — „passed” z oboma wyjątkami. Mutacja: po zmianie identyfikatora w wyjątku gate pada z komunikatem „not covered”; przywrócone.

## Wynik
Job `lint` na otwartych PR-ach wróci do zieleni po aktualizacji ich gałęzi do `main`. Termin przeglądu: 2027-01-15 (wcześniej, jeśli ukaże się poprawione wydanie).

## Lekcje
Zaktualizowana `.ai/lessons/2026-10-25-audit-gate-new-advisories.md` (wyjątek przez osiągalność, gdy poprawki nie ma).
