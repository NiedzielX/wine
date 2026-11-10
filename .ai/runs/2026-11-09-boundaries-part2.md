---
started: 2026-11-09 21:20
ended: 2026-11-10 11:40
agent: Claude Code / claude-sonnet-5-5 (pod-agent, worktree)
spec: brak (testy granic dostępu, sprawdzenie maszynowe, dokumentacja polityki; bez nowej funkcji i bez zmiany kodu aplikacji)
outcome: success (części 2 i 3 macierzy granic: 9 nowych testów e2e T-33..T-36, `check:pages` z testami i CI, polityka 403/404; brak potwierdzonej luki; bramka zielona poza testami przeglądarkowymi; commit lokalny, bez push i PR)
related: [.ai/runs/2026-11-08-boundaries-part1.md, docs/security/threat-model.md]
---

# Macierz granic dostępu, części 2 i 3

## Zadanie
(a) gość a szkic/ukryte/nieopublikowane/obcy tenant/notatki sommeliera na `/r/{slug}` i publicznym API (całe ładunki wobec opublikowanej migawki); (b) mass assignment na każdej trasie i akcji zapisu (inwentarz `check:routes`); (c) polityka 403/404, jedna i testowana; (d) `inviteMember`, login/logout, język, akceptacja zaproszenia (obcy token, wygasły, użyty, powtórka); (e) sprawdzenie maszynowe `requireAccess` przed odczytem danych pod `(admin)/admin` (+ `Promise.all`); (f) mutacja dla każdego testu.

Przebieg przerwany raz (limit sesji) po założeniu logu i instalacji; wznowiony 2026-11-10 w tym samym worktree (scratchpad z bazą został wyczyszczony, baza postawiona od nowa).

## Środowisko
PostgreSQL 16 (Homebrew, `initdb` w scratchpadzie, bez gniazda uniksowego: ścieżka scratchpadu > 103 B) na `127.0.0.1:50520`, `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:50520/postgres`; `npx -y npm@11.20.0 ci`; symlinki `@mikro-orm/{migrations,postgresql,seeder,sql}` do korzenia (lekcja 2026-11-06); `npm run build`, potem `npx vitest run --config vitest.e2e.config.ts` w `packages/app`. Bez agent-browser: 11 plików e2e z przeglądarką pada na `spawn agent-browser ENOENT` (jak w części 1), 14 plików bez przeglądarki zielone (75 testów), w tym dwa nowe.

## Wynik

### Znaleziska
Brak potwierdzonej luki. Obserwacje (bez zmiany kodu):
1. **Obrona w głąb hierarchii zaproszeń działa:** usunięcie `assertMayInvite` w `InvitationService.invite` NIE czerwieni testu (repozytorium PostgreSQL sprawdza hierarchię drugi raz pod blokadą); czerwień dopiero po usunięciu obu. Zapisane w T-36.
2. **Notatka na sugestii jest decyzją:** `setComment` zatwierdza sugestię (`modified`), więc „notatka niezrecenzowanej pary” nie powstaje przez panel; test wpisuje ją bazą, publikacja i tak jej nie wydaje (migawka trzyma tylko pary zrecenzowane i odrzucone).
3. **Natychmiastowe z założenia, nie z migawki:** status dania, dostępność wina, nazwy i ceny bazowe (publikowane są pary i tłumaczenia). Zapisane w T-33 jako decyzja istniejąca, nie luka.
4. **`safeNext`/`languageBack` przepuszczają segmenty `..`** (`/admin/../r/halka`): ten sam origin, nie open redirect; niskie, informacyjnie.
5. **Nieudane logowanie zmienia `app_user.failed_attempts`** (blokada konta): z założenia; test dopuszcza tylko te kolumny.
6. **Narzędzie:** pierwsza wersja `check:pages` (maskowanie z `check-routes.mjs`, które zgaduje literały regex) gubiła ciała stron JSX (`</Tag>`) i po cichu pomijała 15 stron; naprawione własnym maskowaniem bez regexów i błędem „cannot find the body” (fail closed). Test jednostkowy z JSX pilnuje.

### Polityka 403/404 (T-34)
Obcy slug = nieistniejący slug (403 z sesją, przekierowanie do logowania / 401 bez), obce id = nieistniejące id (404, `error=not_found`), 403 tylko dla roli poniżej uprawnienia we własnej restauracji (i CSRF). Gość: nieopublikowane = 404, stół z < 2 opublikowanymi daniami = 422. Zapis: `docs/security/threat-model.md` §4.1, `.ai/docs/engineering-standards.md` §10. Test porównuje status i ciało (po usunięciu nonce i samego pytanego sluga/id) obcego i brakującego: 6 stron, 5 wywołań API po slugu, 11 stron i wywołań po id, 4 akcje po id i po slugu, przekierowanie anonimowe. Kod już był zgodny.

### Sprawdzenie maszynowe `check:pages` (e)
`scripts/check-pages.mjs` + `check-pages.allowlist.json` (8 funkcji, tylko publiczne z założenia drzwi: layout główny, `/admin`, logowanie, akceptacja zaproszenia, wylogowanie, język) + `check-pages.d.mts`, testy `packages/testkit/tests/check-pages.test.ts` (14), `npm run check:pages`, krok w CI (job `lint`), wiersz w `.ai/docs/commands.md`. Dziś: 46 funkcji w 27 plikach.
- **Czerwony najpierw:** drzewo `packages/app/src/app` z commita przed #133 (`0b4be73^`, `git archive`) i bieżący skrypt: `check:pages FAILED: 12 problem(s)`, kod 1: `(lists)/menu/page.tsx` (brak `requireAccess`, odczyt `adminService.menu` — wyciek T-29), `(lists)/page.tsx` (`requireAccess` w `Promise.all` z `overview`, `salesSummary`, `usageSummary`, `pairingPerformance`), `pairings/page.tsx` (odczyt przed sprawdzeniem). Na bieżącym kodzie zielony.

### Testy e2e (a)–(d)
- `access-boundaries-guest.e2e.test.ts`: T-33 ×3 (całe ładunki 17 powierzchni gościa i kelnera, pl/en, API przed i po zmianach nieopublikowanych bajt w bajt; picki sommeliera z API ⊆ zatwierdzone pary z ostatniej `published_version` w bazie; kontrola pozytywna po publikacji; znaczniki dla szkicu/ukrytych; obce id w obie strony; nieznany slug), T-34 (polityka).
- `access-boundaries-writes.e2e.test.ts`: T-35 ×2 (9 tras JSON + logowanie: wszystkie pola naraz, zagnieżdżone, po jednym, 422 i skrót tabel z sesjami, kontrola pozytywna; 3 trasy bez ciała i 5 akcji: całe wiersze przed i po, Bistro skrótem), T-36 ×3 (`inviteMember` przez protokół akcji Next.js `Next-Action` + `encodeReply`; login/logout/język; akceptacja: inne konto, anonim, wygasły, odwołany, zmyślony, powtórka, nowe konto z polami Halki).
- Każdy plik: `snapshotDatabase()` w `beforeAll`, przywrócenie w `afterAll`; pełny przebieg 25 plików: wszystkie pliki bez przeglądarki po nich zielone.
- Helpery w `boundaries.ts`: `actionId`, `postForm` (akcja jako formularz bez JS, z sesją lub bez), `callAction` (akcja `useActionState`).
- Scenariusze QA `security-018`..`security-026` + wiersze w `.ai/qa/INDEX.md`.

### Dowody mutacji (f)
Dwie przebudowy z kilkoma mutacjami naraz (każda celuje w inny test; komunikat błędu wskazuje mutację), potem `git checkout` i przebudowa: zielone.

| Mutacja | Plik | Test czerwony (komunikat) |
|---|---|---|
| M1 gość czyta bieżące pary zamiast migawki | `db/src/repositories/index.ts` `listPublishedByRestaurant` | T-33 nieopublikowane: „an unpublished value reached a guest” (7 wpisów) |
| M2 szkic i ukryte w menu, danie bez sprawdzenia statusu | `catalog-service.ts`, `recommendation-service.ts` | T-33 szkic/ukryte: „a draft or hidden dish or a hidden wine reached a guest” (44 wpisy) |
| M3 wino bez filtra `restaurant` | `PgWineRepository.findById` | T-33 obce id: `/r/halka/wine/<bistro>` 200 zamiast 404 |
| M4 brakujący slug = 404 (ujawnia istnienie) | `server/auth.ts` `requireAccess` | T-34: „page : non-existent: expected 404 to be 403” |
| M5 `strictObject` → `object` | `wine-availability.schema.ts` | T-35 JSON: „PATCH wine, extra fields top level: expected 200 to be 422” |
| M6 akcja czyta pole `restaurant` jako nowy slug | `import-actions.ts` `saveRestaurantDetails` | T-35 akcje: `error=slug_taken` zamiast `saved=details` |
| M7 hierarchia zaproszeń w serwisie | `invitation-service.ts` | T-36 invite: ZIELONY (repozytorium odrzuca) |
| M7+M7b j.w. i w repozytorium | `db/src/repositories/invitations.ts` | T-36 invite: „Halka manager grants owner” bez `status:error` |
| M8 wylogowanie kończy też sesję z pola `token` | `auth-actions.ts` | T-36 login/logout: „one session ended: expected 1 to be 2” |
| M9 powrót języka bez walidacji | `server/auth.ts` `languageBack` | T-36: `https://evil.example/` zamiast `/admin` |
| M10 bez sprawdzenia `wrong_account` | `invitation-service.ts` | T-36 akceptacja: `/admin/halka` zamiast `error=wrong_account` (inne konto dołączyło) |
| M11 usunięte `await requireAccess(slug)` | `qr/page.tsx` | `check:pages`: 2 problemy, kod 1 |

## Weryfikacja
- `npm run lint` czysty; `npm run typecheck` czysty; `npm test`: 745 + 126 + 62 + 500 + 518 zielone; `TEST_DATABASE_URL=… npm run test:db`: 204 zielone; `npm run build` OK; `npm run check:context`: 0 błędów (9 ostrzeżeń istniejących); `npm run check:qa`: 114 scenariuszy; `npm run check:routes` OK (25 handlerów); `npm run check:pages` OK (46 funkcji, 8 na liście); `npm run secrets:scan` OK (21 trafień, wszystkie na liście).
- e2e: 14 plików bez przeglądarki zielone (75 testów, w tym 9 nowych), 11 plików z agent-browser nie do uruchomienia lokalnie (`spawn agent-browser ENOENT`).
- Czego nie sprawdziłem: testów przeglądarkowych, trybu `DATA_SOURCE=memory` dla e2e (e2e tylko PostgreSQL), CI; osobnego dowodu „baza po pliku = baza przed plikiem” (część 1 udowodniła `snapshotDatabase()`; tu: kolejne pliki zielone).

## Dług techniczny / dalej
- Trasy body-less (`publish`, `DELETE`) ignorują ciało; można je odrzucać (422) dla spójności z `strictObject`.
- `safeNext` mógłby odrzucać segmenty `.`/`..`.
- `check:pages` to skan tekstu (limity w nagłówku skryptu): odczyt w pomocniku bez nazwy `…Service` przed bramką nie jest widoczny.

## Poprawki po review PR #146 (2026-11-10)
Dwa przeglądy: testy „approve with minor changes”, sprawdzenie maszynowe „CHANGES NEEDED”.

### `check:pages` (wszystkie od czerwonego testu)
18 nowych przypadków w `check-pages.test.ts` uruchomionych na skrypcie z `875868f`: **18 czerwonych** (obejścia przechodziły po cichu), na nowym skrypcie 36/36 zielonych; drzewo sprzed #133 nadal czerwone (12 problemów), repozytorium zielone (46 funkcji, 8 na liście).
1. (wysokie) Formy eksportu: `export default async () =>`, `export default Page`, `export { P as default }`, `export { default } from`, `export * from`, plik render bez domyślnej funkcji — teraz problem (fail closed); w plikach akcji też `export { a }`, `export default async () =>`, `export const a = function`.
2. (średnie) Bramka musi być bezwarunkową instrukcją najwyższego poziomu (`await g(…);`, `const x = await g(…);`, `const x = (await g(…)).can(…)`, `return g(…);`): `if` bez klamer, `else`, trójargumentowy, `&&`, `||`, pętla, argument innego wywołania — czerwone. Nazwa bramki musi być importowana z jej modułu i nigdzie nie przesłonięta (lokalne `const act`, własna `requireAccess`, alias importu) — czerwone.
3. (średnie) Akcje inline (`'use server'` w ciele funkcji w dowolnym pliku serwerowym) sprawdzane jak akcje eksportowane.
4. (niskie) Maskowanie rozpoznaje literały regex po operatorze lub `return` (nie po `<`, `>`, `)`, `]`, `}`), więc `/["'{]/` nie połyka ciała, a `</Tag>` w JSX nie jest regexem; katalog nie do odczytu to problem, nie ciche pominięcie (test z `chmod 000`, pomijany dla roota).
5. Nagłówek: funkcja z listy jest zwolniona z bramki i z kolejności odczytów w całości; test pilnuje, że lista to dokładnie 8 opisanych publicznych drzwi, żadne pod `[slug]`, powody ≥ 40 znaków. `.ai/docs/commands.md` zaktualizowany.

### Testy e2e
6. T-34 w obie strony (konto Halki przeciw Bistro i konto Bistro przeciw Halce) i z kontrolą pozytywną: te same wywołania (6 stron, 4 odczyty API, publikacja, 11 sond po id, 3 akcje) działają dla właściciela danych, obie restauracje; Wine Director obu restauracji 403 na własnym zespole. Mutacja M12 (obce id pary w `PATCH pairings/{id}` = 403 zamiast 404): czerwony „halka account, PATCH pairing: foreign: expected 403 to be 404”; ta sama mutacja tylko dla sluga `bistro-e2e`: czerwony „bistro-e2e account, PATCH pairing …” (kierunek odwrotny naprawdę sprawdzany). Cofnięte, przebudowane, zielone.
7. Logowanie z polami spoza schematu: dodana kontrola pozytywna (to samo ciało bez pól: 200, ciasteczko, +1 sesja).
8. „Dokładnie migawka”: przy `limit=6` liczba picków = min(|migawka|, 6), a gdy mieszczą się wszystkie, zbiory równe; pick odrzucony po publikacji MUSI być serwowany (bez warunku).
9. `TABLES` obejmuje wszystkie tabele schematu (+`session`, `guest_interaction`; tłumaczenia to kolumny `dish`/`wine`, wiersze importu w `import_job`, osobnych tabel nie ma), a `assertTablesCovered()` w `beforeAll` obu plików pada, gdy pojawi się tabela spoza listy. Testy gościa wyłączają z porównania tylko `guest_interaction` (zdarzenia z założenia) i `recommendation_code` (stół kelnera) i sprawdzają osobno, że żadne nowe zdarzenie nie wskazuje dania nieopublikowanego ani obcego dania lub wina. Pliki części 1 (`access-boundaries`, `access-boundaries-matrix`) zielone z rozszerzonym skrótem.
10. `publish()` przyjmuje 422 tylko jako `nothing_to_publish` i tylko tam, gdzie jest to jawnie dopuszczone (`may-be-published-already` w `beforeAll`); publikacja kontrolna musi dać 201.
11. `afterAll` nie maskuje błędu `beforeAll` (strażnik `restoreDatabase`); strona ukrytego wina i „selected” sprawdzają tekst „This wine is no longer available”.

### Weryfikacja po poprawkach
`npm run lint` czysty, `npm run typecheck` czysty, `npm test` 745 + 126 + 62 + 500 + 540 zielone, `test:db` 204 zielone, `npm run build` OK, `check:context` 0 błędów, `check:qa` 114, `check:routes` OK, `check:pages` OK (46/8), `secrets:scan` OK; e2e: 14 plików bez przeglądarki zielone (75 testów), 11 z agent-browser nie do uruchomienia lokalnie (`ENOENT`).

## Trzecie review PR #146 (2026-11-10, ostatnia runda `check:pages`)
Recenzent: 125 własnych przypadków (skrypty `fx.mjs`, `fx2.mjs`, `fx3.mjs` w scratchpadzie koordynatora, przeczytane w całości przed uruchomieniem: tylko pliki w katalogach tymczasowych i wywołanie `checkPages`), poprzednie punkty zamknięte. Przypadki recenzenta z oczekiwanym wynikiem (84 z `fx.mjs`, 11 z `fx3.mjs`) i 10 przypadków reguły 6 z `fx2.mjs` weszły do `check-pages.test.ts`; przypadki oznaczone przez recenzenta jako znane obejścia lub pytania są opisane w nagłówku jako znane ograniczenia, nie w testach.
- **Czerwone najpierw:** nowy plik testów na skrypcie z `7c4365c`: 19 czerwonych (16 obejść + 3 zmienione komunikaty), na nowym 141/141 zielonych; drzewo sprzed #133 nadal czerwone (12), repozytorium zielone (46/8).
- (1) Reguła 6: każde `export const|let|var` w pliku render lub akcji, którego wartość nie jest zwykłym literałem (wywołanie `cache(async …)`, referencja, trójargumentowy, szablon z `${…}`, drugi deklarator), oraz `export class` padają; literały (`dynamic`, `metadata`, `revalidate`, `runtime`, `maxDuration`, `(1+2)`, tablice i obiekty literałów, `as const`) przechodzą.
- (2) Bramka nie może mieć łańcucha `.catch/.then/.finally/?.` ani operatora po wywołaniu (połknięte odrzucenie); `(await g(…)).can(…)` dalej poprawne.
- (3) Odczyt w argumentach bramki liczy się jako odczyt przed nią (argument-callback `act`/`perform` nie).
- (4) `adminService?.x()` i `adminService['x']()` to odczyty.
- (5) Maskowanie: cudzysłów przyklejony do słowa (`don't`) albo niezamknięty w linii to tekst JSX, `://` to nie komentarz; oba przypadki recenzenta (fałszywy alarm i ukryta kolejność) poprawne.
- Udokumentowane jako znane ograniczenia (nagłówek skryptu i `.ai/docs/commands.md`): pomocnik bez nazwy `…Service`, serwis w innej zmiennej, pliki inne niż render/akcje (`error.tsx`, `loading.tsx`, strzałki `export const` w pomocnikach), BOM przed `'use client'`, pozostały tekst JSX z cudzysłowem lub `//`. Wydajność: plik 20 000 linii 164 ms.
- Weryfikacja: `npm run lint` czysty, `typecheck` czysty, `npm test` 745 + 126 + 62 + 500 + 645 zielone, `test:db` 204, `build` OK, `check:context` 0 błędów, `check:qa` 114, `check:routes` OK, `check:pages` OK, `secrets:scan` OK, e2e 14 plików bez przeglądarki zielone (75 testów), 11 z agent-browser nie do uruchomienia lokalnie.
