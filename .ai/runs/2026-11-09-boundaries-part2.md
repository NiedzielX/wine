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
