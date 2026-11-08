---
started: 2026-11-08 18:45
ended: 2026-11-08 19:20
agent: Claude Code / claude-sonnet-5-5 (pod-agent)
spec: brak (testy i jedna drobna poprawka wyścigu bez zmiany widocznego zachowania)
outcome: success (gałąź lokalna, bez push i PR)
related: [.ai/runs/2026-11-07-check-routes.md]
---

# Test migracji up/down/up i testy współbieżności na PostgreSQL

## Zadanie
(a) dowód `up`/`down`/`up` dla migracji (bramka `risk-high` z SDLC.md), (b) testy równoległości z prawdziwą bazą dla zaproszeń, ról, importu, decyzji o parach, kodów i ostatniego właściciela; wyścig znaleziony przez test naprawić od czerwonego testu.

## Przebieg
- Odczyt: AGENTS.md, packages/db/AGENTS.md, testy db, migracje, lekcje. Tylko `Migration20261014121402_initial` nie ma `down` (11 pozostałych ma); test trzyma ją na jawnej liście `NON_REVERSIBLE`.
- `migrations-roundtrip.integration.test.ts`: zrzut kolumn, tabel, indeksów, ograniczeń, enumów, sekwencji, wyzwalaczy, funkcji; `down()` po jednej migracji od najnowszej (sprawdza nazwę cofniętej); porównanie z bazą po samej `initial`; `up` i porównanie z pierwszym zrzutem; pusta baza i baza z danymi demo. Wynik: zielony za pierwszym razem (wszystkie 11 `down` są odwracalne także z danymi).
- `concurrency.integration.test.ts` + `tests/support/pg.ts` (`race()`: bramka, bez `sleep`; własne połączenie na rywala; 10 rund). Pokryte: akceptacja zaproszenia x2, trzy równoległe zaproszenia na ten sam adres, dwie zmiany roli z tym samym `expectedVersion`, wzajemne usuwanie właścicieli, potwierdzenie importu x3, trzy decyzje o parze z tą samą wersją (approve, reject, komentarz), wydawanie tego samego i różnych kodów + confirm/undo, limit kodów na sesję.
- Wniosek z pierwszych uruchomień (nie błędy produktu, błędy założeń testu): przegrany akceptacji bez zalogowania dostaje `invalid_token` albo `sign_in_required` (zależnie od widoczności konta zwycięzcy przy wstępnym sprawdzeniu); przegrany równoległego zaproszenia może dostać `invitation_conflict` (zamierzone).
- **Wyścig potwierdzony: limit kodów polecenia na sesję (R13).** Czerwony test: 32 kody przy limicie 30 (29 + 8 równoległych różnych wyborów jednej sesji). Poprawka: `RecommendationCodeRepository.tryIssue(…, sessionLimit)` liczy i wstawia w jednej transakcji pod `pg_advisory_xact_lock(restaurant, dzień, sesja)`; status `session_limit` -> serwis zwraca `null` jak dotąd; pamięć i kontrakt (`recommendation-code-contract.ts`) dostały ten sam przypadek. Bez nowej migracji (blokada doradcza, brak zmiany schematu). Zachowanie widoczne w API/UI bez zmian poza tym, że limit teraz naprawdę obowiązuje, więc brak nowych scenariuszy QA (`check:qa` bez zmian).
- Dokumentacja: `commands.md`, `engineering-standards.md` §12, lekcja `2026-11-08-concurrency-tests-and-migration-roundtrip.md`.
- Środowisko: własny PostgreSQL 16 (Homebrew) na porcie 50421, `TEST_DATABASE_URL`, symlinki `@mikro-orm/*` w worktree (lekcja 2026-11-06).

## Weryfikacja
- `npm run lint` czysto; `npm run typecheck` 0 błędów; `npm test` zielone (core 744, db 84, 62, 500, 252 testów).
- `TEST_DATABASE_URL=… npm run test:db`: 7 plików, 203 testy zielone.
- `npm run check:qa` (97 scenariuszy), `check:context` (0 błędów, 11 ostrzeżeń sprzed zmiany), `secrets:scan` bez nowych trafień.
- Czerwony/zielony dla poprawki: patrz sekcja „Karta dowodu”.

## Karta dowodu (wyścig R13)
- Test: `packages/db/tests/concurrency.integration.test.ts` > „the per-session cap on codes (R13) holds for parallel requests”.
- Przed poprawką: `expected 32 to be less than or equal to 30`. Po poprawce: zielony, także w 10 kolejnych przebiegach.
- `npm run verify:regression -- packages/db/tests/concurrency.integration.test.ts --base main`: BEFORE the fix FAIL (31 > 30), AFTER PASS, working tree restored, verdict OK.
- Stabilność: oba nowe pliki 5 razy z rzędu zielone (11 testów, 6-14 s na przebieg obu plików); `npm run build` zielony.

## Wynik
Co działa: migracje odwracalne i sprawdzane maszynowo, osiem scenariuszy współbieżności zielonych. Poza zakresem: zwykły test e2e HTTP (brak zmiany zachowania), `initial` bez `down` (wyjątek jawny).

## Lekcje
`.ai/lessons/2026-11-08-concurrency-tests-and-migration-roundtrip.md`.
