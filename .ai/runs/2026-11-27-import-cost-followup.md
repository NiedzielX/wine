---
started: 2026-11-27 11:35
ended: 2026-11-27 11:55
agent: Claude Code
spec: brak — poprawka błędu po przeglądzie PR #200 (kontekst: .ai/runs/2026-11-25-fix-import-cost-columns.md)
outcome: success
related: [.ai/runs/2026-11-25-fix-import-cost-columns.md, .ai/lessons/2026-10-14-import-conventions.md]
---

# Import: kolumna kosztu nigdy nie trafia do ceny także bez nagłówka, przed „Cena” i przy fałszywych trafieniach

## Zadanie
Niezależny przegląd PR #200 (B1, W1-W3, D1-D3) znalazł dziury w poprawce kolumny kosztu zakupu. Naprawa od testu, który pada; bez pushu i bez PR.

## Przebieg
1. Worktree z `origin/main`, gałąź `fix/import-cost-columns-followup`, `npm ci` (npm 11.6.2, `package-lock.json` bez zmian).
2. Testy czerwone (commit 76c92f5, `packages/core/tests/import.test.ts`): B1 (trzy przykłady z przeglądu, wina `Etykieta;Koszt;Cena`, koszt w dalszych wierszach), W1 (8 nagłówków przed „Cena” / „Cena butelka”, kolejność, niejednoznaczność), D3 (`Hurtownia`, `Cost-plus price`, `Cena po kosztach`), poprawiony test „nie wymienione dwa razy”.
3. Poprawka (`mapping.ts`): (a) plik bez rozpoznanego nagłówka z komórką kosztu w pierwszych 5 wierszach jest odrzucany `ValidationError` `cost_without_header` (wybrane odrzucenie, nie traktowanie wiersza jako nagłówka: bez nazwy dania nie ma jak odczytać rekordów; dotyczy menu i win); (b) `matchField` zwraca dokładność trafienia: dokładny synonim wygrywa z prefiksem niezależnie od kolejności, kilka kandydatów tylko-prefiksowych na pole ceny zostawia cenę pustą z uwagą „Price not chosen, several columns could be it: …”; (c) rdzenie `nabyc`, `kupn`, `buy`, `supplier`, `dostaw` i całe słowo `zak`; (d) uwaga z podpowiedzią „If a skipped column is really your sale price, rename its header…” po uwadze o kosztach i o niewybranej cenie (D3); (e) D1: komentarz bez odwołania do spec-u spoza main. Tłumaczenia PL/EN uwag i błędu (`messages.ts`, `i18n/en.ts`, `i18n/pl.ts`) z testem w `admin-i18n.test.ts`.
4. Dokumentacja: T-44 przeniesiony do tabeli (pod T-43) z `file:line`, BC §6 z notatką Breaking i migracją, jedna lista rdzeni (`COST_STEMS`; `docs/API_SPECIFICATION.md` ją wylicza, reszta odsyła), SCREEN_SPECIFICATION, CHANGELOG, lekcja zaktualizowana.

## Weryfikacja
- `npm run verify:regression -- packages/core/tests/import.test.ts packages/app/tests/unit/admin-i18n.test.ts`: BEFORE the fix: FAIL (core 28 failed | 136 passed; app 1 failed | 15 passed), AFTER the fix: PASS (164; 16), `verdict: OK, the test fails without the fix and passes with it`.
- `npm run lint`, `npm run typecheck`: czyste. `npm test`: wszystkie pakiety zielone (1041, 128, 62, 679 i 686 testów + 1 pominięty). `npm run build`: exit 0.
- `npm run test:db` (PostgreSQL 16 z systemu, własny port i katalog w /var/tmp, zatrzymany po testach, cache Vite wyczyszczony): 10 plików, 263 passed.
- E2E `import-cost-columns.e2e.test.ts` na zbudowanej aplikacji i PostgreSQL (`vitest run --config vitest.e2e.config.ts`): 1 passed.
- `check:context` 0 błędów (35 ostrzeżeń istniejących przed zmianą: wersje w AGENTS.md §1.1; AGENTS.md poza zakresem), `check:qa` (164 scenariusze) OK, `secrets:scan` OK.
- Nie sprawdzano w przeglądarce 390/1440 px (zmiana tekstów uwag i błędu, bez układu) ani `DATA_SOURCE=memory` ręcznie (testy jednostkowe używają repozytoriów w pamięci).

## Wynik
Zamknięte B1, W1, W2, W3, D1-D4. Odstępstwa: B1 rozwiązane odrzuceniem pliku (`cost_without_header`, 422), nie traktowaniem wiersza jako nagłówka. Zmiana zachowania: kilka kolumn „Cena …” bez dokładnej „Cena” daje teraz pustą cenę (dawniej wygrywała pierwsza). Dług: lista rdzeni to nadal heurystyka. Etykieta `risk-high` na PR (W2 przeglądu) do nałożenia przy otwarciu PR (poza zakresem: bez PR).

## Lekcje
Zaktualizowana: [2026-10-14-import-conventions](../lessons/2026-10-14-import-conventions.md).

## Opis PR
**Co:** domyka uwagi przeglądu PR #200: kolumna kosztu zakupu nigdy nie trafia do ceny dania ani wina także w pliku bez rozpoznanego nagłówka (`Potrawa;Cena;Koszt`, `Menu;Cost`, wina `Etykieta;Koszt;Cena`), także gdy stoi przed „Cena” (`Cena nabycia`, `Cena kupna`, `Cena zak.`, `Price net`), z nowymi rdzeniami kosztu `nabyc`, `kupn`, `zak`, `buy`, `supplier`, `dostaw`. Dokładny nagłówek „Cena” / „Price” wygrywa z prefiksowym; kilka kandydatów tylko-prefiksowych = pusta cena z uwagą. T-44 przeniesiony do tabeli z `file:line`; jedna lista rdzeni; komentarz bez odwołania do spec-u spoza main; test fałszywych trafień (`Hurtownia`, `Cost-plus price`, `Cena po kosztach`) z podpowiedzią w uwadze.

**💥 Breaking:** plik, w którym kolumna `koszt` / `cost` była ceną dania, już się nie zaimportuje (kolumna jest pomijana, wiersze bez ceny). Migracja klienta: nazwij kolumnę ceny sprzedaży „Cena” albo „Price”. Plik bez rozpoznanego nagłówka z kolumną kosztu jest odrzucany (422 `cost_without_header`): nazwij kolumny w pierwszym wierszu. Kilka kolumn „Cena netto” / „Cena brutto” bez „Cena” daje pustą cenę z uwagą (dawniej wygrywała pierwsza). Brak ścieżki wstecznej celowo: wyciek kosztu zakupu do gości jest gorszy niż odrzucony plik. Opis w `BACKWARD_COMPATIBILITY.md` §6. Etykiety: `bug`, `risk-high`.

**Dowód:** `npm run verify:regression -- packages/core/tests/import.test.ts packages/app/tests/unit/admin-i18n.test.ts`: BEFORE FAIL (28 + 1 testów), AFTER PASS (164 + 16), verdict OK. Lint, typecheck, `npm test`, build, `test:db` (263), e2e `import-cost-columns` na PostgreSQL: zielone.

## Poprawki po przeglądzie PR #202 (B1, W1, W2, D1, D2, D4)
- Testy czerwone (`20aee8a`), potem poprawka (`df447a2`, `mapping.ts`): (B1a) dwie lub więcej dokładnych kolumn na to samo pole ceny są kandydatami niepewnymi (pusta cena + uwaga „Price not chosen…”); (B1b) wiersze pod nagłówkiem (do dwóch), w których pod kolumną ceny stoi słowo kosztu i które nie mają cyfr, są scalane z nagłówkiem (`isSubHeader`: „Cena” + „zakupu” = koszt, „Cena” + „sprzedazy” = cena) i nie stają się rekordami; (W1) gałąź bez nagłówka szuka kosztu w 20 pierwszych wierszach; (W2) liczą się tylko wiersze wyglądające na nagłówek (bez cyfr), więc dane z „hurtowni” / „Buyer's choice” (z ceną) importują się, a komunikat nie cytuje komórek (zmiana w BC §6).
- D1: ryzyko rezydualne wpisane do T-44 (pojedyncza kolumna „Cena z faktury” / „Cena FV” / „Cena netto” jako koszt nadal przechodzi). D2: test HTTP 422 `cost_without_header` w `import-cost-columns.e2e.test.ts` (status, kod, brak komórek i wartości w ciele, brak nowego `import_job`) i krok 6 w `import-001`. D4: `git fetch origin main:refs/remotes/origin/main` i `git rebase origin/main`, bez konfliktów; numery `file:line` w T-44 odświeżone po rebase.
- verify:regression: `npm run verify:regression -- packages/core/tests/import.test.ts`: BEFORE FAIL (33 padło, 139 przeszło), AFTER PASS (172), verdict OK.
