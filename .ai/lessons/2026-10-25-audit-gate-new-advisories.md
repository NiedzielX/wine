---
date: 2026-10-25
updated: 2026-10-29
area: build
status: active
source: .ai/runs/2026-10-25-audit-gate-next-zod-undici.md
promoted:
---

# Nowy advisory czerwieni CI wszystkich PR-ów; gdy poprawka jest młodsza niż 14 dni, daj dateowany wyjątek dla nazwanych advisories

## Kontekst
2026-10-25 job `lint` (krok `audit:gate`) padał na każdym PR, także na zmianie samej dokumentacji. `main` było zielone trzy dni wcześniej. Przyczyna: nowe advisories (critical dla `next`, high dla `undici` i `zod`).

## Przyczyna
`npm audit` zależy od bazy advisories, nie od zmian w repo. Poprawione wersje mogą być młodsze niż 14 dni z AGENTS §1.1, więc „po prostu zaktualizuj” łamie regułę wieku. Wyjątki w `scripts/audit-gate.mjs` były dopasowywane po nazwie pakietu, więc wyjątek dla pakietu ciszyłby też każdy jego przyszły advisory.

## Reguła
- Gdy gate padnie na nowym advisory, najpierw sprawdź `npm run audit:gate` lokalnie i datę publikacji wersji z poprawką (`npm view <pakiet> time`).
- Poprawka starsza niż 14 dni: zbumpuj (łatka bez specyfikacji, test `test`, `test:db`, `build`).
- Poprawka młodsza: wyjątek w `ACCEPTED` z **listą identyfikatorów advisories**, powodem i datą wygaśnięcia nie później niż dzień, w którym poprawiona wersja kończy 14 dni; po tej dacie bump. Nowy advisory tego samego pakietu zawodzi bramkę.
- Zapisz termin w logu przebiegu i w PR; wygasły wyjątek zaczerwieni CI, więc nie da się go zapomnieć.

## Jak sprawdzić
`npm run audit:gate` przechodzi; po usunięciu jednego identyfikatora z wyjątku kończy się kodem 1 z komunikatem „is not covered by the accepted exception”.

## Aktualizacja 2026-10-29
Przed użyciem poprawionej wersji sprawdź jej dokładną godzinę publikacji (`npm view <pkg> time`), nie samą datę: `undici` 7.30.1 miało 13 dni 17 godzin w dniu wygaśnięcia wyjątku. Nowe advisories dla tego samego pakietu, z tą samą poprawką, dopisz do nazwanego wyjątku z tym samym terminem zamiast przedłużać go dla wszystkiego.
