---
started: 2026-11-04 10:00
ended: 2026-11-05 17:20
agent: Claude Code / claude-sonnet-5-5
spec: .ai/specs/implemented/2026-10-16-recommendation-code.md (E09, plan item E11b)
outcome: success
related: [.ai/specs/implemented/2026-10-16-recommendation-code.md, .ai/runs/2026-10-21-e09-f3-pos-code-matching.md, .ai/lessons/2026-11-05-unticked-acs-audit-before-building.md]
---

# E11b: zamknięcie kryteriów akceptacji kodu polecenia (E09)

## Zadanie
Dla każdego niezaznaczonego AC (AC1–AC6, AC13–AC15) ustalić, czy jest spełnione na `main` (kod i test), i zaimplementować tylko to, co naprawdę otwarte. Issues #89 i #90 należą do E20. Poprzedni agent zmarł (limit wydatków) po założeniu tego logu.

## Przebieg
- Merge `origin/main`, `npm ci`, własny PostgreSQL 16 na porcie 50303.
- Przeczytana specyfikacja i plan (wiersz E11b, „Stan dziś”, „Ustalenia międzyepikowe”); zmapowanie każdego AC na test, uruchomienie testów.
- Wynik audytu: wszystkie dziewięć AC było już spełnionych od F1/F2 (2026-10-18), tylko nie zaznaczonych. Zmiany: dwa testy stron (AC6, AC13 na ekranie), zaznaczenie AC, status `implemented`, `git mv` do `implemented/`, ścieżki w scenariuszach `.ai/qa`.

## Tabela AC
| AC | Status | Dowód |
|---|---|---|
| AC1 format kodu | spełnione od F1 (0f93477) | `core/tests/recommendation-code.test.ts` „the code format” |
| AC2 dzień serwisu, zmiana czasu | spełnione od F1 | ten sam plik „the service day” (4 przypadki DST) |
| AC3 `tryIssue`/`findByCode`, izolacja | spełnione od F1 | `core/src/testing/recommendation-code-contract.ts` (pamięć w `core`, PostgreSQL w `test:db`) |
| AC4 kolizje: 4 znaki, potem `null` | spełnione od F1 | `core/tests/recommendation-code.test.ts` „moves to four characters…” |
| AC5 G8 bez JS: wiersz, odświeżenie, `direct`, obce `table=` | spełnione od F1 | `app/tests/e2e/recommendation-code.e2e.test.ts` (PostgreSQL) + `app/tests/unit/recommendation-code.test.ts`; QA guest-011, guest-012 |
| AC6 brak kodu: nieaktywne, 404, synthetic; rzucające/wolne repozytorium | spełnione od F1; dołożony test strony | e2e j.w.; `issueCodeForPage` (rzut, `ISSUE_TIMEOUT_MS`); NOWY: „G8 when the write fails” w `recommendation-code.test.ts`; QA guest-013 |
| AC13 limity 30/300, >12 dań, ekran z komunikatem | spełnione od F1; dołożony test G11 | rdzeń: `core/tests/recommendation-code.test.ts`; G8: `app/tests/unit/recommendation-code.test.ts`; NOWY: G11 po 300 poleceniach w `staff-table.test.ts` |
| AC14 `Cache-Control: no-store` | spełnione od F1 | e2e na zbudowanej aplikacji (`recommendation-code.e2e.test.ts`) |
| AC15 `Sec-Fetch-Site: cross-site`, obcy `Origin` | spełnione od F2 (cafab9b) | `app/tests/unit/staff-code.test.ts`, `app/tests/e2e/staff-code.e2e.test.ts`; QA staff-004 |

## Weryfikacja
- `npm run lint`: 0. `npm run typecheck`: 0. `npm run build`: 0.
- `npm test`: core 581, db 70 (bez bazy), app 359, ui 62 przeszły; testkit: `agent-guardrails.test.ts` pada (52 z 79, znane, do scalenia PR #115), reszta testkitu przechodzi.
- `npm run test:db` (PostgreSQL 16, port 50303): 114 przeszło.
- e2e (`recommendation-code.e2e.test.ts` 3, `staff-code.e2e.test.ts` 4 testy HTTP) przeszły na zbudowanej aplikacji; test przeglądarkowy 390/1440 px z `staff-code.e2e.test.ts` i pozostałe testy z `agent-browser` nie biegły (brak przeglądarki).
- `npm run check:context` 0 błędów (9 ostrzeżeń o rozmiarze cudzych specyfikacji), `npm run check:qa` 63 scenariusze, `npm run secrets:scan` OK.
- `verify:regression`: nie dotyczy (brak poprawki błędu, tylko testy dla kodu już poprawnego).

## Wynik
Specyfikacja kodu polecenia: wszystkie AC zaznaczone, status `implemented`, przeniesiona do `implemented/`. Kod produkcyjny i schemat bez zmian. Dług: odwołania do starej ścieżki specyfikacji w innych aktywnych specyfikacjach (plan E11b–E22, `backlog.md`, `product-brief.md`) nie zostały zmienione, bo należą do równoległych gałęzi; wystarczy, że ktoś je poprawi przy najbliższej edycji. Otwartych pytań do właściciela brak.

## Lekcje
[2026-11-05-unticked-acs-audit-before-building.md](../lessons/2026-11-05-unticked-acs-audit-before-building.md)
