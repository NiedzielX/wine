---
started: 2026-11-19 10:00
ended: 2026-11-19 10:30
agent: Claude Code
spec: .ai/specs/2026-11-18-restaurant-picks.md
outcome: success
related: [.ai/specs/2026-11-18-restaurant-picks.md, .ai/specs/2026-11-04-restaurant-operations.md, .ai/runs/2026-11-18-restaurant-picks-spec.md]
---

# Adnotacja: E19 F2 zastąpione przez `2026-11-18-restaurant-picks`

## Zadanie
Tylko dokumentacja. Dopisać w E19 adnotację przy F2 (bez usuwania treści) i wpis w Changelogu; poprawić odniesienia z punktu W9 przeglądu specyfikacji picks w E13, E17, planie i pozostałych specyfikacjach.

## Przebieg
- Gałąź `docs/e19-f2-superseded-by-picks` z `origin/main`. Przeczytane: lekcje (indeks), sekcje „Nakładanie z E19” i W9 w specyfikacji picks.
- E19 jest `approved`: tylko adnotacje (nagłówek F2, lista faz, tabela migracji, wiersz A27, uprawnienia, Changelog), wymagania bez zmian. Zmiana wymaga świadomości właściciela.
- Poprawione odniesienia: E13 (kontrakt pkt 3 i 4), E17 (`sell_priority` na `pick`, O11), plan (wiersz E19, wiersz E17, tabela uprawnień, pkt 5, kryterium, Q6, Q14), E18 (akapit „Dopasowanie z E19”), silnik v1.x (poza zakresem), edycja pól katalogu.
- Bez zmian celowo: `.ai/maintenance/2026-11-15-audit.md` i `.ai/runs/*` (dzienniki), `research/benchmarks/*` (materiał źródłowy), sama specyfikacja picks. W kodzie, `docs/`, skillach i `.ai/docs/` brak trafień.

## Weryfikacja
`git grep` po wzorcu `sellPriority|sell_priority|wines.priority|wina do sprzedania` przed i po; `node scripts/check-context.mjs` i `node scripts/secret-scan.mjs` (wyniki w raporcie przebiegu).

## Wynik
Zmiany tylko w `.ai/specs/` i tym logu. Bez push i PR.

## Lekcje
brak
