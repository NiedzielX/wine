---
started: 2026-11-07 13:00
ended: 2026-11-07 13:30
agent: Claude Code / claude-sonnet-5-5 (pod-agent)
spec: brak (mały krok narzędziowy, bez zmiany zachowania aplikacji; ok. 5 plików, ale tylko narzędzie i dokumentacja)
outcome: success (check, testy, CI, docs, lekcja; commit na gałęzi, bez push i bez PR przez limit WIP)
related: [.ai/docs/fix-verification.md]
---

# Zadanie domowe lekcji 17: `check:routes`

## Zadanie
Jedną klasę błędu, która wróciła mimo review (trasa API z pominięciem wspólnego wrappera, E21 F1), zamienić w deterministyczne sprawdzenie, czerwone na wadliwej wersji z właściwego powodu i zielone na poprawnej, wpięte w wymagany job CI.

## Kontrakt (z `api-auth.ts` i 23 plików `route.ts`)
- `handle` (sesja, CSRF, uprawnienie), `handlePublic` (bez sesji), `handleUnscoped` (zdrowie, bez zakresu żądania); wszystkie wymagają `route` (wzorzec, nie URL), `handle` także `write`. Etykieta metryki to tylko `route` (bez metody), więc ta sama etykieta w dwóch plikach zlewa metryki.
- Dwa pliki bez wrappera z uzasadnieniem: `import-samples/[kind]` (statyczne CSV, `force-static`) i `metrics` (endpoint metryk, działa bez bazy, scrape nie liczy się w `http_requests_total`). Oba w `scripts/check-routes.allowlist.json` jako `exceptions`.
- `health` używa `handleUnscoped`, cztery trasy gościa `handlePublic`: wpisy `publicRoutes` (wrapper bez sesji to decyzja, nie domyślna).
- Akcje serwerowe nie są route handlerami (`authorizeAction`), poza zakresem.

## Wynik
Na aktualnym `main` (39d695b): 25 handlerów w 21 plikach, 21 unikalnych tras, zero naruszeń. **Żadnej prawdziwej, nieobsłużonej trasy dziś nie ma** (trasy zespołu i zaproszeń z E12 F2 mają `route`), więc nie było co naprawiać z testem czerwonym.

## Karta dowodu
| Pole | Wartość |
|---|---|
| Hipoteza | Handler bez `route` (lub bez wrappera, z duplikatem etykiety, złym `write`, nieuprawnionym `handlePublic`) przechodzi review i CI, a znika z logów i metryk; sprawdzenie statyczne łapie to deterministycznie. |
| Zakres / ryzyko | `packages/app/src/app/api/**/route.*`; tylko odczyt plików, brak zmiany kodu aplikacji. Ryzyko: fałszywy alarm blokujący merge (loguje `plik:linia`, wyjątek przez allowlist z powodem). |
| Baza + commit | baza `39d695b` (main, PR #125); commit z tą pracą: patrz sha w raporcie / `git log` gałęzi `worktree-agent-a37dac2d9adc5dc8b`. |
| Środowisko | macOS (Darwin 25.5), Node v22.23.3, npm 11.20.0 (`npx npm@11.20.0 ci`), 2026-11-07 ok. 13:08; brak bazy i seedów (kod statyczny); katalog kopii `/private/tmp/claude-501/red` (kopia `packages/app/src/app/api` + `scripts/check-routes.*`). |
| Polecenie | `node scripts/check-routes.mjs` (= `npm run check:routes`); w kopii: `node /private/tmp/claude-501/red/scripts/check-routes.mjs`. |
| Oczekiwane | czerwone (kod 1) na kopii z usuniętym `route`, z `plik:linia`; zielone (kod 0) na bieżącym drzewie. |
| Faktyczne (czerwone) | W kopii z `restaurants/[slug]/team/route.ts` bez `route: '…/team'`: `packages/app/src/app/api/v1/restaurants/[slug]/team/route.ts:14: handle() options have no `route`: the request log line and the metric get no route label` / `check:routes FAILED: 1 problem(s)` / `exit 1`. Różnica kopii względem drzewa: wyłącznie ta jedna linia (`diff -r`). |
| Faktyczne (czerwone 2) | Ta sama trasa z `route` skopiowanym z `invitations`: dwa komunikaty (`file path gives '…/team'` oraz `already used by …/invitations/route.ts:14`), `exit 1`. |
| Faktyczne (zielone) | Bieżące drzewo: `check:routes OK: 25 handlers in 21 route files, 21 unique routes.` / `exit 0`. |
| Dowód w repo | `packages/testkit/tests/check-routes.test.ts` (14 testów: brak wrappera, brak `route`, pusty/obliczony/niezgodny `route`, duplikat, zły helper, `write` vs metoda, nieobsługiwane formy eksportu, wyjątek z allowlist, wpis nieaktualny, czysty przypadek, CLI w ścieżce ze spacją). |
| Czego NIE dowodzi | Nie parsuje TypeScriptu (tekst + maskowanie komentarzy/literałów): nietypowe konstrukcje dadzą fałszywy alarm, nie ciche przejście (formy `export const`/re-export padają zamykająco). Nie widzi wczesnych `return` przed wrapperem (walidacja parametrów bez logu, istnieją w 4 plikach: imports/[ref], pairings, pairings/[id], wines/[id]), nie sprawdza treści uprawnienia (`permission`), logiki handlera ani akcji serwerowych. Wymóg `route` pilnuje też już `tsc` (typ opcji); nowe w tym sprawdzeniu to wywołanie wrappera, unikalność, zgodność ze ścieżką, `write`, allowlist. Nie dowodzi, że job `lint` jest oznaczony jako wymagany w ochronie gałęzi na GitHubie (ustawienie właściciela, nie plik). |
| Decyzja / właściciel | Do akceptacji przez właściciela (NiedzielX) w PR; po scaleniu jedyna droga obejścia to wpis w allowlist z powodem, widoczny w diffie. |

## Weryfikacja
Wyniki w sekcji poniżej.

## Uruchomione polecenia
- `npm run check:routes`: OK, 25 handlerów / 21 plików / 21 tras.
- `npx vitest run tests/check-routes.test.ts` (testkit): 14/14.
- `npm run lint`: 0 uwag. `npm run typecheck`: bez błędów (dodano `scripts/check-routes.d.mts`, bo test importuje `.mjs`).
- `npm test`: core 741, db 84, ui 62, app 476, testkit 179 zielone.
- `npm run build`: OK (granice, design, mockups, Next.js). `npm run check:context`: 0 błędów (11 ostrzeżeń, istniejące). `npm run check:qa`: OK. `npm run secrets:scan`: OK.
- Nie uruchomione: `test:db`, `test:e2e`, `boot:check` (brak zmian w kodzie aplikacji, bazie ani UI); pierwszy przebieg CI na GitHubie (brak push). Ustawienie „required” dla joba `lint` w ochronie gałęzi widać tylko na GitHubie.

## Lekcje
`.ai/lessons/2026-11-07-deterministic-check-over-review.md`.
