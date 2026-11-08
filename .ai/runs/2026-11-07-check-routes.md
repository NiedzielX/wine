---
started: 2026-11-07 13:00
ended: 2026-11-08 10:00
agent: Claude Code / claude-sonnet-5-5 (pod-agent)
spec: brak (mały krok narzędziowy, bez zmiany zachowania aplikacji)
outcome: success (PR #128 otwarty, review w toku; poprawki po review dwóch recenzentów naniesione, czeka na CI i właściciela)
related: [.ai/docs/fix-verification.md]
---

# Zadanie domowe lekcji 17: `check:routes`

## Zadanie
Jedną klasę błędu, która wróciła mimo review (trasa API z pominięciem wspólnego wrappera, E21 F1), zamienić w deterministyczne sprawdzenie, czerwone na wadliwej wersji z właściwego powodu i zielone na poprawnej, wpięte w wymagany job CI.

## Kontrakt (z `api-auth.ts` i plików `route.ts`)
- `handle` (sesja, CSRF, uprawnienie), `handlePublic` (bez sesji), `handleUnscoped` (zdrowie, bez zakresu żądania); wszystkie wymagają `route` (wzorzec, nie URL), `handle` i `handlePublic` także literalnego `write` (sprawdzenie CSRF dla zmian). Etykieta metryki to tylko `route` (bez metody), więc ta sama etykieta w dwóch plikach zlewa metryki.
- Wrapper jest pierwszą instrukcją metody: `return`, `throw`, `if`, pętla, `switch`, `try` przed nim oznaczają ścieżkę bez linii logu i bez metryki.
- Dwa pliki bez wrappera z uzasadnieniem: `import-samples/[kind]` i `metrics` (`exceptions`). `health` (`handleUnscoped`) i cztery trasy gościa (`handlePublic`) są w `publicRoutes`. Każdy wpis ma `methods`.
- Akcje serwerowe nie są route handlerami (`authorizeAction`), poza zakresem.

## Zmiany po review (PR #128)
- Baza `39d695b`, merge `a05e2bd` (#127) oraz `origin/main` z #126 (`d50ef7e`; zmienił `handle()`/login o straż „demo tylko do odczytu”, sygnatury wrapperów bez zmian); `escapeRegExp` dla alertu CodeQL (`js/incomplete-sanitization`) dodał koordynator (`006d52d`). Sha końcowy: głowa PR #128 (nie wpisuję go tu, bo commit go zmienia).
- **`methods` w każdym wpisie allowlist** (`exceptions`, `publicRoutes`, `earlyReturns`): metoda dodana później do wpisanego pliku (np. POST w `metrics`) pada, wymieniona a nieeksportowana też.
- **Wczesne kody przed wrapperem pada** (było udokumentowaną luką). Własny skan znalazł dokładnie 9 handlerów w 6 plikach (walidują `?restaurant=` lub id przed `handle()`): `imports/[ref]` POST/GET/DELETE, `imports/[ref]/rows` PATCH, `imports/[ref]/confirm` POST, `pairings` POST, `pairings/[id]` PATCH/DELETE, `wines/[id]` PATCH. Wpisane do `earlyReturns` z powodem „tracked: fixed by refuseEarly() … (K3)”; nieaktualny wpis pada. Samo `const { x } = await ctx.params;` przed wrapperem jest dozwolone (brak słów kluczowych sterowania).
- `write` literalne także dla `handlePublic`; trzy trasy gościa dostały jawne `write: false` (zachowanie bez zmian, `write` nieustawione i `false` działają tak samo).
- Zakres: każdy `route.{ts,tsx,js,jsx,mts,cts,cjs,mjs}` pod `packages/app/src/app` poza `api/` pada, chyba że jest w `exceptions`.
- Fałszywe alarmy: typ zwracany z klamrami (`Promise<{…}|Response>`) i `route: '…' as const` są czytane poprawnie; goły typ obiektowy jako zwracany i `return`/`if` w callbacku przed wrapperem zostają znanymi ograniczeniami (nagłówek skryptu).
- Testy: 14 -> 41 przypadków w `check-routes.test.ts` (nowe czerwone: dodatkowa metoda w pliku z allowlist, wymieniona a brakująca, brak/zła tablica `methods`, wczesny `return`/`throw`/braceless `if`, wpis `earlyReturns` nieaktualny/niewymieniona metoda, `write` dla `handlePublic`, route poza `api/`, spread, drugi argument nie-literał, brak/nie-literał `write`, helper niezaimportowany (z aliasem i bez), „cannot find the body”, brak `file`/`helper`, wpis podwójny, wyjątek i publiczna naraz, nieaktualny `publicRoutes`, helper niezgodny z allowlist).
- Dokumentacja: `engineering-standards.md` §11 (§11.1 klasa wyjątku „nowy samodzielny skrypt narzędziowy z testami i dokumentacją, jeden na PR”, **ten PR z niej korzysta**; §11.3 odsyła do definicji `risk-high` w `SDLC.md` zamiast definiować ją drugi raz i mówi, gdzie zapisać wyniki: komentarze „Review 1/2”), wskaźnik do `check:routes` w liście kontrolnej §8, wskaźnik do §11 w `CODE_REVIEW.md` (nie zmieniałem `AGENTS.md`).
- Wybór w §11.3 (mniejsza spójna opcja): dodatkowe ścieżki (`scripts/`, `.github/`, `.claude/`, sekrety, silnik) to tylko wskazówka dla paczki przeglądu (review pack, gdy będzie na `main`), nie podnoszą etykiety. Alternatywa (zmiana SDLC.md, żeby je liczyć) zmieniałaby bramkę QA wszystkich PR-ów i należy do osobnego PR-a właściciela.

## Karta dowodu
| Pole | Wartość |
|---|---|
| Hipoteza | Handler bez `route` (lub bez wrappera, z kodem wychodzącym przed nim, duplikatem etykiety, złym `write`, nieuprawnionym `handlePublic`, dodaną później metodą w pliku z wyjątkiem) przechodzi review i CI, a znika z logów i metryk; sprawdzenie statyczne łapie to deterministycznie. |
| Zakres / ryzyko | `packages/app/src/app/**/route.*`; odczyt plików; jedyna zmiana kodu aplikacji to jawne `write: false` w 3 trasach gościa. Ryzyko: fałszywy alarm blokujący merge (komunikat `plik:linia`, wyjątek przez allowlist z powodem). |
| Baza + commit | baza `39d695b`; zmergowane `a05e2bd` (#127) i `d50ef7e` (#126); finalnie głowa PR #128. |
| Środowisko | macOS (Darwin 25.5), Node v22.23.3, npm 11.20.0; 2026-11-07/08; brak bazy i seedów; kopia drzewa `/private/tmp/claude-501/red` (kopia `packages/app/src/app/api` + `scripts/check-routes.*`). |
| Polecenie | `node scripts/check-routes.mjs` (= `npm run check:routes`); w kopii `node /private/tmp/claude-501/red/scripts/check-routes.mjs`. |
| Oczekiwane | czerwone (kod 1) na kopii z jedną wadą, z `plik:linia`; zielone (kod 0) na bieżącym drzewie. |
| Faktyczne czerwone 1 (brak `route`, wersja z 2026-11-07) | `restaurants/[slug]/team/route.ts:14: handle() options have no route: …` / exit 1 (jedyna różnica kopii: ta linia, `diff -r`). |
| Faktyczne czerwone 2 (duplikat) | `team/route.ts` z `route` z `invitations`: „file path gives …/team” oraz „already used by …/invitations/route.ts:14”, exit 1. |
| Faktyczne czerwone 3 (`write`) | `pairings/route.ts` POST z `write: false`: `pairings/route.ts:12: POST is a change but handle() says write: false (the CSRF check would be skipped)`, exit 1 (2026-11-08, kopia z merge). |
| Faktyczne czerwone 4 (zły helper) | `restaurants/[slug]/qr/route.ts` przepisane na `handlePublic`: `qr/route.ts:11: handlePublic() opens a door without a session; … must be listed under "publicRoutes" … or use handle()`, exit 1. |
| Faktyczne zielone | bieżące drzewo (po merge #126, #127): `check:routes OK: 25 handlers in 21 route files, 21 unique routes.`, exit 0. Bez wpisów `earlyReturns` te same 9 handlerów byłoby czerwone (komunikaty `has if before handle()`), co jest dowodem na regułę wczesnych kodów; czerwone/zielone dla `write` i helpera dodatkowo jako testy jednostkowe (`check-routes.test.ts`), nie tylko jako ręczne kopie. |
| Czego NIE dowodzi | Brak parsera TypeScript (tekst + maskowanie): konstrukcje spoza znanych kształtów dają fałszywy alarm, nie ciche przejście (formy `export const`/re-export padają zamykająco). Nie sprawdza treści `permission`, logiki handlera ani akcji serwerowych. Wymóg `route` pilnuje też `tsc`. Wczesne kody są dziś długiem (`earlyReturns`, 9 handlerów) do spłaty w K3. Nie dowodzi, że job `lint` jest „required” w ochronie gałęzi (ustawienie GitHuba). |
| Decyzja / właściciel | Do akceptacji przez właściciela (NiedzielX) w PR #128; po scaleniu obejście to wpis w allowlist z powodem i listą metod, widoczny w diffie. |

## Weryfikacja (po poprawkach z review, 2026-11-08)
- `npm run check:routes`: OK (25 handlerów, 21 plików, 21 tras). `npm run lint`: 0 uwag. `npm run typecheck`: bez błędów.
- `npm test`: core 743, db 84, ui 62, app 500, testkit 207 zielone (w tym `check-routes.test.ts` 41). `npm run check:context`: 0 błędów (11 ostrzeżeń, istniejące). `npm run check:qa`: 97 scenariuszy OK. `npm run secrets:scan`: OK. `npm run build`: patrz raport.
- Nie uruchomione: `test:db`, `test:e2e`, `boot:check` (brak zmian logiki aplikacji; `write: false` w trzech trasach bez zmiany zachowania); CI GitHuba na tym commicie.

## Lekcje
`.ai/lessons/2026-11-07-deterministic-check-over-review.md`.
