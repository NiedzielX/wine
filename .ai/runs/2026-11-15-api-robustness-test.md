---
started: 2026-11-15 12:10
ended: 2026-11-15 12:40
agent: Claude Code
spec: brak — nowy test, bez zmiany zachowania
outcome: success
related: []
---

# Test odporności API na zniekształcone dane (TEST-04)

## Zadanie
Dodać deterministyczny test fuzz/robustness wszystkich tras `api/v1` na `DATA_SOURCE=memory`, żeby `npm run audit:process` zamknął TEST-04. Bez zmiany zachowania; prawdziwe błędy tylko zgłosić.

## Przebieg
- Worktree `/home/user/wine-fuzz` z origin/main, gałąź `test/api-robustness`.
- Plik `packages/app/tests/unit/api-robustness.test.ts`: lista tras z `import.meta.glob` po drzewie `api/v1` (27 par metoda+trasa; nowa trasa bez profilu = czerwony test, wyjątki tylko w `NOT_FUZZED` z powodem), ziarno `mulberry32(0xC0FFEE)`, bez zegara i sieci.
- Kategorie: ciało (złe JSON-y, głębokość, 100k elementów, klucz 100k znaków, >2 MB, `__proto__`/`constructor`, pola obce, zły typ każdego pola, brak pola, 40 losowych struktur), multipart (14 plików x 3 rodzaje importu), parametry ścieżki (30 wartości), zapytanie (brak/puste/powtórzone/tablice/znaki sterujące/klucze prototypu, wartości znanych kluczy), nagłówki (CSRF, Origin, cookie, Content-Type, If-Match, Authorization), role i tenanci (obcy właściciel dostaje to samo co dla nieistniejącej restauracji, własny slug + obce id).
- Asercje na każdą odpowiedź: status w zbiorze, nigdy 5xx, koperta `{error:{code,message,fields?}}`, brak stosu/ścieżek/SQL/sekretów/danych Halki, stan magazynu (JSON całego `MemoryStore` bez sesji) bez zmian po odrzuceniu; po całości `Object.prototype` bez zmian.
- Błędy w moim teście poprawione po drodze (nie w aplikacji): `' token '` w nagłówku jest przycinany i wylogował konto (logout wyłączony z tego przypadku), `a;b` w cookie to dwa ciasteczka, brak domyślnego `If-Match`, pusty `Authorization` zastępowany prawidłowym.
- Przyspieszenie: migawka stanu liczona ponownie tylko po udanym żądaniu innym niż GET (z 31 s do ok. 3,5 s).

## Weryfikacja
- `npx vitest run tests/unit/api-robustness.test.ts`: 24 passed, 1 expected fail, ok. 3,5 s; 2861 żądań, 27 tras.
- Dowód mutacyjny 1 (tymczasowo, cofnięty `git checkout`): `parseBody(req, wineAvailabilitySchema)` zastąpione `await req.json()` w `wines/[id]/route.ts` → 5 testów czerwonych (status 500 i oczekiwane 422 dla pustego/nie-JSON/obciętego ciała, brak odrzucenia pól obcych). Po cofnięciu zielono.
- Dowód mutacyjny 2 (tymczasowo, cofnięty): wyłączone sprawdzenie CSRF w `api-auth.ts` → 4 testy czerwone (m.in. logout bez tokenu 204 zamiast 403). Po cofnięciu zielono.
- `npm run lint`: czysto (po usunięciu regexów ze znakami sterującymi). `npm run typecheck`: bez błędów. `npm test -w @wine-match/app`: zielono. `npm run check:context`: 0 błędów (9 ostrzeżeń o starych specach). `npm run check:routes`: OK, 25 handlerów. `npm run secrets:scan`: OK.
- `npm run audit:process`: TEST-04 PASS (`packages/app/tests/unit/api-robustness.test.ts`); pozostałe FAIL (5) niezwiązane.

## Wynik
Test działa. Prawdziwy błąd (nienaprawiony, `it.fails`): `fieldsOf()` w `core/src/validators/parse.ts` wpisuje każdy nieznany klucz do `fields`, więc klucz 100 kB wraca w 422 jako ~100 kB (do ~2 MB przy limicie ciała). Odtworzenie: `POST /api/v1/recommendations/table` z ciałem `{"<100000 znaków>":1}`. Nie znaleziono 5xx, wycieku stosu, prototype pollution ani wycieku między restauracjami. Decyzja o poprawce (obcięcie kluczy w `fields`) po stronie właściciela; po niej zmienić `it.fails` na `it`.
Obserwacja: `parseBody` ignoruje Content-Type (ciało JSON z `text/plain` jest przyjmowane), a goły BOM to puste ciało na trasach z `optional`; oba udokumentowane w teście, bez zmiany.

## Lekcje
brak

## Poprawka znalezionego błędu (agent nadrzędny, 2026-11-15)
Błąd: nieznany klucz w ciele wracał w całości w `fields` odpowiedzi 422 (klucz 100 kB → błąd ok. 100 kB). Reprodukcja była w teście jako `it.fails`; poprawka: `fieldsOf()` w `packages/core/src/validators/parse.ts` przycina klucz do 80 znaków (`clip`), test jednostkowy w `packages/core/tests/validators.test.ts`, w teście odporności `it.fails` zamienione na `it`. Zmiana dotyczy tylko absurdalnie długich kluczy; krótkie klucze i kody bez zmian.
