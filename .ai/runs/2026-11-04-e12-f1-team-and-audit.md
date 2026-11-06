---
started: 2026-11-04 10:00
ended: 2026-11-05 17:45
agent: Claude Code / claude-sonnet-5-5
spec: .ai/specs/2026-11-04-staff-accounts-and-roles.md
outcome: success (F1 complete; F2–F6 not started)
related: []
---

# E12 F1: zespół i dziennik uwierzytelniania (uprawnienia, membership.status/version, auth_event, TeamService, A15, API zespołu)

## Zadanie
Faza F1 specyfikacji E12 (AC1–AC6, AC23). Tylko F1; `wm_staff` należy do F5. Przebieg wznowiony po przerwaniu poprzedniego agenta (limit wydatków): częściowa praca (uprawnienia, typy, port `team.ts`, pamięć) została zachowana po przeglądzie i zacommitowana jako WIP, potem `git merge origin/main` bez konfliktów.

## Przebieg
- Gałąź `feat/e12-f1-team-and-audit`. Spec z `approved` na `in-progress` (po scaleniu `main`, który ma plan i specyfikacje E12–E22).
- Dobre z WIP: `Permission` + 3 uprawnienia, typy `TeamMember`/`AuthEvent`, błędy domenowe, port i pamięć. Do poprawy: pamięć (`applyChange` przepisane na `assertKeepsAnOwner`), brakowało serwisu, kontraktu, encji, migracji, Pg, aplikacji. `.tmp-specs/` usunięty (nie był śledzony).
- Core: `TeamService`, `team-rules.ts`, `teamChangeSchema`, `teamContract` (pamięć) + `tests/team.test.ts`.
- Db: encje, migracja `Migration20261105160730_team_status_and_auth_event`, `PgTeamRepository` (blokada `for update`), `PgAuthAuditRepository`, kontrakt na PostgreSQL, wyścig AC23 (osiem rund, dwa połączenia), wycofanie transakcji (AC5), test up/down migracji.
- App: API `GET|PATCH /team`, A15, akcje, nawigacja, i18n PL/EN, testy jednostkowe (API, akcje, strona, dezaktywacja na tej samej sesji), e2e `team.e2e.test.ts` + 4 scenariusze `.ai/qa/team/`.
- Docs: DATA_MODEL, API_SPECIFICATION, USER_ROLES, SCREEN_MAP, SCREEN_SPECIFICATION, AGENTS pakietów; smoke dla A15; Realizacja i Q-F1 w specyfikacji.

## Weryfikacja stanu kodu (twierdzenia specyfikacji)
- `permissions.ts`, `AuthRepository.membershipsOf`, `AuthService.authenticate` (buduje `Principal` przy każdym żądaniu): potwierdzone odczytem; dezaktywacja działa od razu, bo tylko `membershipsOf` czyta status.
- `docs/DEPLOYMENT.md` (runbook E11) nie istnieje: adnotacja z Q19 jest w specyfikacji E11 i powtórzona w `docs/DATA_MODEL.md`.
- Wyścig właścicieli: mutacja (usunięcie `for update`) wywala test AC23 (obie zmiany się udają) — test jest czuły.

## Weryfikacja
Uruchomione (PostgreSQL 16 lokalnie, port 50301, `TEST_DATABASE_URL`):
- `npm run lint`: 0 ostrzeżeń. `npm run typecheck`: bez błędów.
- `npm test`: core 614, db 70, ui 62, app 370 zielone; `testkit/agent-guardrails` 52 pada (znana przyczyna, PR #115), zignorowane.
- `npm run test:db`: 132 zielone (kontrakt zespołu na PostgreSQL, AC4/AC5/AC23, migracja up/down).
- `npm run build`: OK (boundaries, design, mockups, app). `npm run check:context`: 0 błędów (10 ostrzeżeń o rozmiarze specyfikacji, istniejące). `npm run check:qa`: 67 scenariuszy OK. `npm run secrets:scan`: OK.
- `schema:check` bez zmian dla baz `winematch`, `winematch_test`, `winematch_e2e`, `winematch_db_test`; zaktualizowane snapshoty wszystkich sześciu baz.
- e2e (plain fetch na zbudowanej aplikacji i PostgreSQL): `team.e2e.test.ts` (4), `tenant-isolation`, `restaurant-create`, `unknown-ids`: 11 zielonych. Testy przeglądarkowe (agent-browser) nie były uruchamiane: brak narzędzia.
- `scripts/smoke.mjs` w trybie `DATA_SOURCE=memory` i `postgres` (baza `wm_smoke`): wszystkie sprawdzenia, w tym 5 nowych dla A15, zielone.
- UI w przeglądarce panelu Claude (JS włączony): A15 przy 390 i 1440 px, bez poziomego przewijania (`scrollWidth` = szerokość okna), bez błędów w konsoli, „Remove access” i „Restore access” działają na żywo. Nie sprawdzono bez JavaScriptu w przeglądarce (formularze serwerowe; render bez skryptu potwierdzony HTML-em w e2e).

## Wynik
F1 spełnione: AC1–AC6 i AC23 mają testy. Dług/otwarte: Q-F1 w specyfikacji (manager a inny manager, jedno zdarzenie na żądanie, runbook E11).

## Lekcje
- `.ai/lessons/2026-11-05-pg-execute-inside-transaction.md`
- `.ai/lessons/2026-11-05-memory-store-rows-need-team-fields.md`

## Poprawki po przeglądzie niezależnym (2026-11-05, ten sam przebieg)
Decyzja delegata właściciela: manager nie rusza innego managera. Pozycje 1–7 z przeglądu.
- Pozycja 1 (manager a manager): test najpierw czerwony (`tests/team.test.ts`, brak odmowy), potem `mayTouch`; mutacja cofająca regułę znów daje czerwony test. Testy API i strony w `app/tests/unit/team.test.ts`; A15 nie pokazuje pól przy innym managerze.
- Pozycje 2–5: kod i kontrakt powstały w jednym kroku, więc „czerwony najpierw” sprawdziłem mutacją, po jednej na pozycję, na pamięci: usunięcie `assertChangeAllowed` (TOCTOU), listy dozwolonych kluczy `meta`, zgodności `restaurantId` zdarzenia, warunku remisu kursora `(at, id)`, ograniczenia `limit` — każda dała czerwony test kontraktu (`team-contract.ts`); na PostgreSQL czerwony dała mutacja usunięcia `assertChangeAllowed` (test TOCTOU z kontraktu). Test z dwoma połączeniami (aktor dezaktywowany w trakcie oczekiwania na blokadę) przechodzi przy obu kolejnościach wyścigu, więc dowód jest w teście deterministycznym kontraktu, nie w wyścigu.
- Błąd znaleziony dopiero przez PostgreSQL: wiersz aktora bez `userId` dawał `TeamHierarchyError` zamiast `SelfChangeError` (typy to wychwyciły; poprawione `asMember(actor)`).
- Pozycja 6: strona A15 zamienia `ForbiddenError` na `forbidden()`; komunikat `version_conflict` neutralny (PL i EN, test w `admin-i18n.test.ts`, smoke); rola+status w jednym żądaniu zapisują dwa zdarzenia (test w `team.test.ts`). `.snapshot-wm_smoke.json`: w `main` był nieaktualny (12 tabel, bez `recommendation_code`, `sales_record`); sprawdziłem programowo, że po regeneracji różni się od `main` wyłącznie trzema dodanymi tabelami (`auth_event`, `recommendation_code`, `sales_record`) i czterema kolumnami `membership`, a zbiór tabel jest równy `.snapshot-winematch.json` (różnice w kolejności indeksów i tekście check w `pairing`/`recommendation_code`/`sales_record` są wcześniejsze i występują we wszystkich snapshotach per baza).
- Pozycja 7: adnotacja o wycofaniu (przywrócić stan dostępu lub unieważnić sesje; filtrowanie w czasie żądania; reaktywacja ożywia sesje) w specyfikacji E11 i `docs/DATA_MODEL.md`.
Wyniki pełnej bramki po poprawkach: lint 0; typecheck 0 błędów; `npm test` core 622, db 70, ui 62, app 371 zielone (testkit guardrails: znane 52 porażki); `test:db` 138; `build` OK; `check:context` 0 błędów; `check:qa` 67; `secrets:scan` OK; `schema:check` czysty (4 bazy); smoke w pamięci i PostgreSQL zielony; e2e team, tenant-isolation, restaurant-create, unknown-ids: 11 zielonych.
