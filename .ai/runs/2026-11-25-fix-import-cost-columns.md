---
started: 2026-11-25 15:30
ended: 2026-11-25 16:25
agent: Claude Code
spec: brak — poprawka błędu (kontekst: .ai/specs/2026-11-25-margin-dashboard.md, draft, R9, D16, AC17)
outcome: success
related: [.ai/specs/2026-11-25-margin-dashboard.md, .ai/lessons/2026-10-14-import-conventions.md]
---

# Import win i menu nie czyta kolumny kosztu zakupu jako ceny

## Zadanie
Przegląd specyfikacji pulpitu marży znalazł defekt: nagłówek „Cena zakupu” / „Cena zakupu netto” pasował do `bottlePrice` (reguła prefiksu, synonim `cena`), a w imporcie menu `cost` i `koszt` były synonimami ceny. Ceny to dane bieżące widoczne dla gości bez publikacji, więc koszt zakupu mógł wyciec do menu gości. Naprawa od reprodukcji, bez pushu i bez PR.

## Przebieg
1. Worktree z `origin/main`, gałąź `fix/import-cost-columns-not-price`; `npm ci` (npm 11.6.2), PostgreSQL 16 z systemu jako `postgres` (port 54377, katalog w /var/tmp, zatrzymany po testach).
2. Test czerwony (commit 2b6291a): `packages/core/tests/import.test.ts` (17 nagłówków kosztu w menu i winach, kolumna kosztu przed ceną, plik tylko z kosztem, zwykłe kolumny ceny dalej działają, brak podwójnej uwagi, serwis importu), `packages/db/tests/import-cost-columns.test.ts` na nowych plikach `menu-purchase-cost.csv` i `wines-purchase-cost.csv` (kolumna „Cena zakupu netto” przed ceną, kanarek 7777,77; dopisane do `generate.py`). 38 + 2 testy padały.
3. Poprawka (62b13b0) w `packages/core/src/import/mapping.ts`: `isCostHeader` (rdzenie `zakup`, `koszt`, `cost`, `purchas`, `hurt`, `wholesale`) wyłącza kolumnę z dopasowania do pól cen także przez prefiks; `cost` i `koszt` usunięte z synonimów ceny menu; uwaga „Cost columns skipped, never read as a price: …” (tylko nagłówki); plik z nazwą i kolumną kosztu jest nagłówkiem bez ceny (inaczej awaryjna kolejność kolumn bez nagłówka czytałaby koszt jako cenę). Kolumna kosztu nie trafia też do „Columns not used”.
4. Tłumaczenie uwagi w podglądzie (en/pl, `noteText`, test w `admin-i18n.test.ts`).
5. Dowód na prawdziwym przepływie: `packages/app/tests/e2e/import-cost-columns.e2e.test.ts` (PostgreSQL, HTTP): wgranie, podgląd (API i strona), zatwierdzenie, publikacja, odpowiedzi gościa, `import_job.rows`, wiersze `dish` i `wine`, migawka, log aplikacji: kanarek nigdzie. Scenariusz `.ai/qa/import/import-001-…`, wiersz T-44 w modelu zagrożeń.
6. Dokumentacja: `BACKWARD_COMPATIBILITY.md` §6 (zmiana zachowania `cost`/`koszt`), `docs/SCREEN_SPECIFICATION.md` (import menu), `docs/API_SPECIFICATION.md` (imports), `CHANGELOG.md`, lekcja o imporcie zaktualizowana (bez duplikatu).

## Weryfikacja
- `npm run verify:regression -- packages/core/tests/import.test.ts packages/db/tests/import-cost-columns.test.ts packages/app/tests/unit/admin-i18n.test.ts`: BEFORE the fix: FAIL (core 38 failed | 91 passed; db 2 failed; app 1 failed | 15 passed), AFTER the fix: PASS (129, 2, 16), `verdict: OK, the test fails without the fix and passes with it`.
- Test e2e (`import-cost-columns.e2e.test.ts`) zielony na zbudowanej aplikacji i PostgreSQL (1 passed). Nie ma wersji czerwonej: `verify:regression` nie obsługuje e2e, a jednostkowe testy już dowodzą czerwieni.
- `npm run lint`, `typecheck`: czyste. `npm test`: wszystkie pakiety zielone (zestawy 1006, 128, 62, 665 i 686 testów + 1 pominięty). `npm run build`: exit 0. `npm run test:db` (PostgreSQL 16 bez Dockera): 263 passed.
- `check:qa` (158 scenariuszy), `check:pages`, `check:routes`, `check:boundaries`, `secrets:scan`: OK. `check:context`: 0 błędów, 35 ostrzeżeń (m.in. wersje w AGENTS.md §1.1 starsze niż `package.json`, istniejące przed zmianą; AGENTS.md poza zakresem).

## Wynik
Kolumna kosztu zakupu nigdy nie jest ceną dania ani wina w imporcie menu i win; podgląd ostrzega o pominięciu. Poza zakresem: import sprzedaży (synonimy tylko dokładne, bez zmian), PDF (nagłówki generowane, bez kosztów). Dług: lista rdzeni kosztu jest heurystyką nagłówków (np. „Marża” nie jest rozpoznawana; nie była ceną i dziś trafia do „Columns not used”). Weryfikacja strony w przeglądarce 390/1440 px nie dotyczy (zmiana tekstu uwagi, bez układu).

## Lekcje
Zaktualizowana: [2026-10-14-import-conventions](../lessons/2026-10-14-import-conventions.md) (reguła prefiksu daje fałszywe dopasowanie cen).
