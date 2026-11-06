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
