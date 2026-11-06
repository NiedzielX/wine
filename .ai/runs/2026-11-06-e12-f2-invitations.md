---
started: 2026-11-06 09:00
ended: 2026-11-06 14:10
agent: Claude Code / claude-sonnet-5-5
spec: .ai/specs/2026-11-04-staff-accounts-and-roles.md
outcome: partial (AC7-AC9, AC24-AC25 met; "skrypt demo" of the F2 row not built: question Q-F2 in the spec)
related: [.ai/runs/2026-11-04-e12-f1-team-and-audit.md]
---

# E12 F2: zaproszenia (auth_token), przyjęcie A17, lista i cofnięcie w A15, rezerwacja slugów accept, reset, account

## Zadanie
Faza F2 specyfikacji E12 (AC7–AC9, AC24–AC25), `risk-high` (sesje, nowa tabela). Tylko F2. F1 (TeamService, audyt, A15) użyte bez przepisywania.

## Przebieg
- Core: port `InvitationRepository`, reguły, `InvitationService` (w tym `inviteOwner` dla E14), pamięć, kontrakt; `RESERVED_SLUGS`; `addSecondRestaurant` dodaje też restaurację do pamięci.
- Db: encja i migracja `auth_token` (kontrola zarezerwowanych slugów), `PgInvitationRepository`, kontrakt na PostgreSQL, testy równoległości (dwa połączenia), ograniczeń i migracji; snapshoty 7 baz.
- App: API zaproszeń, A15 (formularz `useActionState`, lista), A17, akcje, nagłówki, i18n, smoke, testy jednostkowe i e2e (plain fetch), scenariusze QA team-005..009.
- Znaleziska: (1) `domainError` ma zamkniętą listę nazw: nowe błędy dawały 500 (lekcja); (2) funkcja i18n jako prop komponentu klienckiego: `prerender` w Vitest to przepuszcza, zbudowana aplikacja zwraca 500 (lekcja); (3) e2e zmieniające wersję Mareka psuło `team.e2e` (wersja 1): zaproszony menedżer zamiast istniejącego; (4) lint `react(purity)`: `Date.now` w renderze, zastąpione zegarem z kontenera.
- Dowód „było możliwe, teraz odmowa”: slugi `accept`/`reset`/`account` (`verify:regression` na `validate-slug.test.ts`: czerwony przed, zielony po). Reszta to nowe funkcje (czerwone przed = brak modułu). Mutacja: usunięcie `used_at is null` z zużycia tokenu wywala kontrakt i test wyścigu na PostgreSQL.

## Weryfikacja
PostgreSQL 16 lokalnie, port 50311, `TEST_DATABASE_URL`.
- `npm run lint`: 0. `npm run typecheck`: bez błędów.
- `npm test`: core 695, db 73, ui 62, app 429, testkit 152 zielone.
- `npm run test:db`: 179 zielone (kontrakt zaproszeń, wyścig dwóch przyjęć x8 rund, ograniczenia bazy, migracja ze zarezerwowanym slugiem).
- `npm run build`: OK (boundaries, design, mockups, app). `npm run boot:check`: OK.
- `npm run smoke` na `DATA_SOURCE=memory` i `postgres` (baza `wm_smoke`): wszystkie sprawdzenia, w tym 10 nowych (A15, API, A17, martwy link 404).
- e2e `invitations`, `team`, `tenant-isolation`, `restaurant-create`, `unknown-ids`: 16 zielonych. Pełne `npm run test:e2e`: testy oparte o agent-browser padają (narzędzia nie ma w tym środowisku), pozostałe zielone; brak przeglądarki bez JS: AC9 sprawdzone formularzami multipart z `fetch`, nie przeglądarką.
- `npm run check:context`: 0 błędów (10 ostrzeżeń o rozmiarze, istniejące). `npm run check:qa`: 77 scenariuszy. `npm run secrets:scan`: OK. `schema:check`: czysty dla 7 baz.

## Wynik
AC7, AC8, AC9, AC24, AC25 mają testy (zob. „Realizacja” w specyfikacji). Nie zrobione: „skrypt demo” (niejasny, Q-F2 pkt 1); UI nie oglądane w przeglądarce przy 390/1440 px (brak narzędzia; układ to karty jak A15 z F1).

## Lekcje
- `.ai/lessons/2026-11-06-client-component-props-are-not-functions.md`
- `.ai/lessons/2026-11-06-new-domain-errors-need-the-app-allowlist.md`
- `.ai/lessons/2026-11-06-show-a-secret-once-with-use-action-state.md`

## Poprawki po przeglądzie niezależnym (PR #123, 2026-11-06, ten sam przebieg)
- Poważne 1 i 2: kolumna `auth_token.platform` (migracja F2 edytowana, bo nigdzie poza gałęzią niezastosowana; snapshoty 7 baz odświeżone), jedna reguła `invitationStillValid` (zwykłe: zapraszający nadal aktywny z `team.manage` i uprawniony do roli, brak wiersza = odmowa; platformy: rola `owner`, brak aktywnego właściciela, konto nie jest aktywnym `team.manage`), przy tworzeniu i przy użyciu; przy przyjęciu platformy blokada wiersza restauracji. Czerwone najpierw (pamięć: 7 testów padło przed poprawką); na PostgreSQL mutacje: bez blokady lokalu pada test „dwa linki platformy”, bez reguły platformy dwa testy, ze starą regułą „null = platforma” trzy.
- Poważne 3: logowanie po założeniu konta w osobnym `try`: błąd kończy na `/admin/login?notice=account_created` (konto istnieje, link zużyty, bez tokenu w adresie), sesja innej osoby kończona dopiero po udanym logowaniu. Czerwone: test akcji z `AuthService.login` odrzuconym. `already_member` z akcji: test (zielony od razu: zachowanie już było, teraz przypięte).
- Poważne 4: `security-notes.md` §9, spec Q-F2 pkt 8.
- Drobne 5: `scrubbedError` (`server/scrub-error.ts`) usuwa adresy z komunikatu i stosu (wspólny redaktor celowo je zostawia: `logging.test.ts`), użyte w akcji przyjęcia i w `action-runner`; czerwone: test z wymuszonym błędem sterownika. Drobne 6: strona nie wkłada tokenu do `next`, tekst „otwórz link jeszcze raz”; czerwone: zmieniony test strony; wpis w `docs/OPERATIONS.md`.
- Drobne 7: wygasłe zaproszenie jest zastępowane niezależnie od roli (czerwone: kontrakt, pamięć); zastąpienie żywego zaproszenia wyższej roli nadal daje `team_hierarchy`: twierdzenie o wycieku nie ma podstawy, bo lista A15 pokazuje managerowi wszystkie oczekujące zaproszenia. Drobne 8: `lower()` po obu stronach (pamięć i PostgreSQL), testy z kontem w mieszanej wielkości liter. Drobne 9: `invitationJson` z zegarem aplikacji. Drobne 10: e2e `wrong_account` (i `sign_in_required` już było).
- Luki testów: na PostgreSQL przyjęcie kontra cofnięcie i kontra dezaktywacja zapraszającego (dwa połączenia, 12 rund; asercje o stanie końcowym, nie o kolejności), platforma i właściciel dodany później, dwa linki platformy naraz.

Weryfikacja po poprawkach (PostgreSQL 16, port 50311): `npm run lint` 0; `typecheck` czysty; `npm test` core 702, db 73, ui 62, app 434, testkit 152; `npm run test:db` 188; `npm run build` OK; `boot:check` OK; smoke w pamięci i na PostgreSQL (baza `wm_smoke` odtworzona) zielony; `check:context` 0 błędów; `check:qa` 77; `secrets:scan` OK; `schema:check` czysty dla 7 baz; e2e invitations, team, tenant-isolation, restaurant-create, unknown-ids: 16 zielonych.
