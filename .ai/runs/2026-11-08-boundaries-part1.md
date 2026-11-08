---
started: 2026-11-08 18:30
ended: 2026-11-08 19:30
agent: Claude Code / claude-sonnet-5-5 (pod-agent, worktree)
spec: brak (testy granic dostępu i jedna poprawka; bez nowej funkcji)
outcome: success (macierz granic część 1, jedna luka znaleziona i naprawiona od czerwonego testu, strażnik isUuid; bramka zielona poza testami przeglądarkowymi; bez push i PR)
related: [.ai/runs/2026-11-07-lesson-16-security.md, docs/security/threat-model.md]
---

# Macierz granic dostępu, część 1 z 3

## Zadanie
Reguła trzech sprawdzeń (`.ai/docs/engineering-standards.md` §10) dla granic, których pierwszy przebieg (`access-boundaries`, `tenant-isolation`) nie objął; strażnik `isUuid` w czterech repozytoriach. Części 2 (gość a szkic/ukryte, mass assignment, polityka 403/404) i 3 (reszta) osobno.

## Znalezisko (wysokie): lista menu w panelu wyciekała dane każdemu
`GET /admin/<dowolny-slug>/menu` oddawał w ciele odpowiedzi nazwy, id, kategorie, ceny i statusy WSZYSTKICH dań restauracji: koncie innej restauracji (w ciele 403) i **bez sesji** (w ciele przekierowania do logowania). Przyczyna: `(lists)/menu/page.tsx` czytał dane bez własnego `requireAccess`, a Next.js renderuje layout i stronę równolegle (layout sprawdza dostęp, strona już strumieniuje dane). Pozostałe strony wołają `requireAccess` przed odczytem, więc nie przeciekały. Wykryte przez T-29 (test sprawdza ciało odpowiedzi, nie status). Czerwony: 36 wpisów w tablicy znalezisk (18 dań Halki i Bistro w ciałach 403 i przekierowań); po jednej linii poprawki (`await requireAccess(slug)` przed odczytem) zielony. Dowód: ten sam plik testu, ta sama baza, build przed i po. `verify:regression` nie obsługuje e2e, więc czerwony/zielony ręcznie. Lekcja: `.ai/lessons/2026-11-08-page-reads-data-in-parallel-with-layout-check.md`. Do zrobienia (część 3): sprawdzenie maszynowe, że każda `page.tsx` pod `[slug]` woła `requireAccess` przed danymi.

## Środowisko
PostgreSQL 16 (Homebrew) na `127.0.0.1:50400`, `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:50400/postgres`; `npm@11.20.0 ci`; symlinki `@mikro-orm/{migrations,postgresql,seeder,sql}` (lekcja 2026-11-06); `npm run build`, potem `vitest run --config vitest.e2e.config.ts` w `packages/app`. Bez przeglądarki: 11 plików e2e z agent-browser nie działa (`spawn agent-browser ENOENT`), 12 plików bez przeglądarki zielone (`access-boundaries`, `access-boundaries-matrix`, `tenant-isolation`, `team`, `invitations`, `unknown-ids`, `showcase`, `security-headers` i inne).

## Macierz zasób × operacja (z kodu)
Oznaczenia: `3` = trzy sprawdzenia (kontrola pozytywna obu kont, odmowa odczytu i zapisu, stan po z ładunkami i skrótem), `slug` = tylko 403 po slugu, `-` = brak. Kolumny: obcy tenant po id / obcy slug / rola poniżej uprawnienia. Stan PRZED → PO tego PR.

| Zasób / operacja | id obcego tenanta | obcy slug | rola |
|---|---|---|---|
| `pairings/{id}` PATCH, DELETE | 3 → 3 | 3 → 3 | 3 → 3 (T-02) |
| `wines/{id}` PATCH | 3 → 3 | 3 → 3 | - → - |
| `imports/{ref}` GET, DELETE, `confirm` | 3 → 3 | 3 → 3 | n/d (import.manage ma Wine Director) |
| `imports/{ref}/rows` PATCH | - → **3 (T-25)** | - → **3** | n/d |
| `imports/{kind}` POST (upload) | n/d | slug → 3 (T-31 akcja `uploadImport`; trasa API: nadal slug) | n/d |
| `pairings` POST (tworzenie; GET listy na tej trasie nie ma) | - → **3 (T-26)** | - → **3** | - → **3** (manager 403) |
| `restaurants/{slug}/pairings` GET | - → **3 (T-26, T-32)** | slug → **3** | n/d |
| `restaurants/{slug}/qr` GET | n/d | slug → **3 (T-32)** | n/d |
| `restaurants/{slug}/publish` POST | n/d | slug → **3 (T-32)** | owner/manager tak, anonim 401 |
| `pairings/bulk-decision` POST | n/d | slug → **3 (T-32)** | slug → **3** (manager 403) |
| `team` GET | n/d | slug → **3 (T-27)** | - → **3** (Wine Director 403) |
| `team/{membershipId}` PATCH, `invitations` POST/GET/DELETE | 3 → 3 | 3 → 3 | 3 → 3 (T-02) |
| `dishes/{dishId}/recommendations` GET (publiczna) | - → **3 (T-28)**, kontrola pozytywna tylko Halka | n/d | n/d |
| akceptacja zaproszenia, `/demo` zapis, publish anonimowy | 3 → 3 | n/d | n/d |
| strony panelu pod `/admin/{slug}`: pulpit z KPI, menu, wines, review, opportunities, publish, qr, setup, team, import/{menu,sales,wines} | - → **3 (T-29)** | slug (3 strony) → **3 (16 stron, 2 konta, anonim)** | team: Wine Director 403 |
| strony ze szczegółami `menu/{id}`, `pairings/{id}`, `wines/{id}`, `?job=` | - → **3 (T-29)** | - → **3** | n/d |
| akcje serwerowe z id (pairing 7, wine 3, dish/wine translations, addPairing, suggestion, dismiss/restore, import rows/confirm/cancel, team role/deactivate) | - → **3 (T-30)** | n/d | n/d |
| akcje serwerowe po slugu i roli (details, content, settings, suggestions, publish, approveAll, upload, slug takeover) | n/d | - → **3 (T-31)** | - → **3** |

Liczby: wiersze z `-` dla obcego id lub obcego sluga i lukami: PRZED 10 komórek bez sprawdzenia lub tylko `slug`, PO 0 komórek `-` w zakresie części 1.

### Co zostaje (części 2 i 3)
- Gość a szkic/ukryte i nieopublikowane (publiczne `r/{slug}/…`, `public/restaurants/{slug}/menu`, recommendations dla dania szkicowego): T-28 sprawdza tylko jeden szkic.
- Mass assignment (`strictObject`) dla pozostałych schematów: tylko `pairings` POST, zaproszenia, team PATCH.
- Polityka 403 a 404 (dziś: obce id 404, obcy slug 403 — decyzja do zapisania).
- Kontrola pozytywna Bistro: brak opublikowanego dania (T-28), brak okazji w panelu (`dismissOpportunity`, `restoreOpportunity` tylko Halka); wymaga danych Bistro z opublikowanym daniem i okazją.
- KPI ze sprzedażą: Halka nie ma w seedzie wierszy sprzedaży (`sales_record` 0), strony KPI sprawdzone z pustymi liczbami; import sprzedaży potwierdzony przez API nie jest wykonywany (zmieniłby stan, na którym polega `kpi-sales`).
- Role poziomu strony poza `team` (np. Wine Director a `restaurant.edit` na stronie `setup`: sprawdzone tylko przez akcję).
- `inviteMember` (akcja z `useActionState`) i `login`/`logout`/`language` akcje.
- Sprawdzenie maszynowe `requireAccess` przed danymi w każdej `page.tsx`.
- Brak testu `usunięcie zasobu przez DELETE pairings` ponad T-01 w drugą stronę dla Bistro (jest).

## Karty dowodowe (wspólne pola)
Baza `4aeeee2`, gałąź `sec/boundaries-part1`, 2026-11-08 18:50–19:30 CET, PostgreSQL 16 na `127.0.0.1:50400`, zbudowana aplikacja, dane: `halka` (konta demo) i `bistro-e2e` (konta testowe `new-restaurant.ts`) z przykładowym cennikiem win i menu potwierdzonymi w `beforeAll`. Plik: `packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts` (8 testów zielonych), wspólne helpery `boundaries.ts` (wyniesione z `access-boundaries`, jego 4 testy zielone). Każdy test: kontrola pozytywna obu kont, odmowy, ładunki obu restauracji + skrót 14 tabel (dodano `sales_record`, `opportunity_dismissal`).

| Karta | Hipoteza | Wynik | Scenariusz |
|---|---|---|---|
| T-25 | wiersze cudzego importu można poprawić pod własnym slugiem | odmowa 404/403, stan bez zmian | security-010 |
| T-26 | parowanie obcego dania/wina, lista obca | odmowa 404/422/403, lista pusta | security-011 |
| T-27 | team czytany bez `team.manage` lub cudzy | 403, brak e-maili | security-012 |
| T-28 | recommendations serwuje obce/szkicowe danie | 404, brak danych | security-013 |
| T-29 | strona panelu niesie cudze dane | **TAK: menu (naprawione)**; reszta nie | security-014 |
| T-30 | akcja serwerowa z obcym id działa | 20 odmów `error=not_found` itd., stan bez zmian | security-015 |
| T-31 | akcja pod obcym slugiem/rolą, przejęcie sluga | `error=forbidden`, slug_taken, bez zmian | security-016 |
| T-32 | trasy slug-level otwarte | 403/401, bez zmian | security-017 |

## Dowód mutacji
Mutacja: usunięty filtr `restaurant: restaurantId` w `PgDishRepository.findById` (po jednym `void restaurantId` dla kompilatora), przebudowa, ten sam plik: **3 testy czerwone** (T-26: obca para utworzona, 201; T-28: obce danie obsłużone, 200; T-30: `dish_not_published` zamiast `not_found`, czyli akcja doszła do obcego dania), pozostałe zielone. Cofnięte (`git checkout`), przebudowane, zielone. T-29 poza tym znalazł prawdziwą lukę (patrz wyżej): czerwony na kodzie bez poprawki.

## Strażnik isUuid
`PgOpportunityDismissalRepository` (`listActive`, `remove`), `PgGuestInteractionRepository` (`listBySession`, `countGuestSessions`, `usageTotals`, `pairingStats`), `PgRecommendationCodeRepository` (`findByCode`, `setConfirmed`, `countBySession`, `pairStats`, `totals`, `unmatchedPosCodes`, `countUnmatched`), `PgSalesRepository` (`checkTotals`, `dataRange`, `countChecks`): id restauracji i sesji, które nie jest UUID-em, jest nieznane (puste, 0, `null`, `false`), jak w pamięci; `countUnmatched` zwraca liczbę różnych par (brak restauracji, brak kodów), jak pamięć. Zapisy (`upsert`, `record`, `tryIssue`) bez strażnika: dostają `restaurantId` z wyszukania po slugu, a klucz obcy i tak je odrzuca. Przypadek w `repository-contract.ts`, 4 wartości (`abc`, pusty, tekst z apostrofem, UUID z `g`). `verify:regression -- packages/db/tests/repositories.integration.test.ts`: PRZED fail (1 test czerwony: `treats a restaurant or session id that is not a UUID…`), PO pass (157/157). Powtórzony po poprawce `countUnmatched` w kontrakcie (patrz Weryfikacja).

## Weryfikacja
- `npm run lint` czysty; `npm run typecheck` (przez `build`) czysty; `npm test`: 744 + 84 + 62 + 500 + 252 testów zielone; `npm run test:db` (PostgreSQL 50400): 192 zielone; `npm run check:qa`: 105 scenariuszy; `npm run check:routes` OK (25 handlerów); `npm run check:context`: 0 błędów (11 ostrzeżeń istniejących); `npm run secrets:scan`: OK; `npm run build`: OK.
- e2e: 12 plików bez przeglądarki zielone (66 testów), 11 plików z agent-browser nie da się uruchomić tutaj (`spawn agent-browser ENOENT`), tak jak w poprzednich przebiegach.
- Czego nie sprawdziłem: testów przeglądarkowych (e2e z agent-browser), trybu `DATA_SOURCE=memory` (e2e tylko PostgreSQL), CI.
