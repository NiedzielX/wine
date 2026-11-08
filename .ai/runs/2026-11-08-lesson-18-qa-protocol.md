---
started: 2026-11-08 13:30
ended: 2026-11-08 13:55
agent: Claude Code / claude-sonnet-5-5
spec: brak (dokumentacja procesu i mała zmiana narzędzi operatora; zakres z zadania koordynatora)
outcome: success (gałąź lokalna, bez push i bez PR: limit WIP, PR otworzy koordynator)
related: [.ai/runs/2026-11-07-lesson-16-security.md]
---

# Lekcja 18 („tester z AI”) dopasowana do repozytorium

## Zadanie
Protokół QA dla agentów bez równoległego testera-właściciela, szablon błędu, baza wiedzy QA, gotowe prompty oraz utwardzenie środowiska poleceń operatora (cel bazy na stderr, ostrzeżenie o cieniu `DATABASE_URL`).

## Przebieg
- Przeczytane: `AGENTS.md`, `.ai/qa/README.md`, `fix-verification.md`, `engineering-standards.md` (§10; §11 nie istnieje na `main`), `SDLC.md` (bramka QA, `qa-approved` per commit), `.ai/agentic.config.json`, `security-notes.md`, `seed-guard.ts`, polecenia w `packages/db/scripts` i `scripts/user-invite.ts`, skill `om-qa-buddy`. `review-protocol.md` na `main` nie ma: protokół opiera dyscyplinę na `fix-verification.md` §4 i `CODE_REVIEW.md`.
- Test najpierw (czerwony): `db/tests/db-target.test.ts` (brak modułu), potem `db/src/db-target.ts` (`describeDbTarget`, `parseDotenvValue`, `shadowWarning`, `announceDbTarget`). Podpięte: `create-restaurant.ts`, `create-user.ts`, `scripts/user-invite.ts`, `mikro-orm.config.ts` (CLI: `db:seed`, `db:migrate`...).
- `check-qa-scenarios.mjs` traktował `.ai/qa/knowledge/` jak obszar scenariuszy: test (czerwony) `testkit/tests/check-qa-scenarios.test.ts`, potem pominięcie katalogu `knowledge`.
- Znalezisko: pierwsze podpięcie przez eksport z indeksu `@wine-match/db` zepsuło `next build` (Turbopack: `import.meta.url` + odczyt pliku w pakiecie webowym). Naprawa: helper poza indeksem, `scripts/user-invite.ts` importuje go ścieżką względną.
- Dokumenty: `.ai/docs/qa-protocol.md`, `.ai/qa/bug-template.md`, `.ai/qa/prompts.md`, `.ai/qa/knowledge/README.md` i wpis seed (security), sekcja w `.ai/qa/README.md`, akapit w `.ai/docs/commands.md`, wiersz routingu w `AGENTS.md`.

## Weryfikacja
PostgreSQL 16 (Homebrew) własny, port 50381. npm 11.20.0 (`npx npm@11.20.0 ci`).
- `npm run lint`: 0. `npm run typecheck`: czysto (`scripts/user-invite.ts` nie należy do żadnego pakietu; załadowany przez `tsx` w teście z procesem).
- `npm test`: core 743, db 107 (w tym 23 nowe), ui 62, app 500, testkit 169 zielone.
- `TEST_DATABASE_URL=… npm run test:db`: 191 zielone.
- `npm run build`: OK (po poprawce z indeksem). `npm run check:boundaries`: OK.
- `npm run check:context`: 0 błędów, 11 ostrzeżeń (10 istniejących o rozmiarze specyfikacji; `AGENTS.md` 24 597 B, powyżej progu ostrzeżenia 23 552 B, błąd dopiero od 27 648 B). `npm run check:qa`: 97 scenariuszy OK. `npm run secrets:scan`: OK.
- Ręcznie: `npm run db:migrate` i `npm run db:seed` na bazie `qa_probe` z wyeksportowanym `DATABASE_URL` drukują `db: database target localhost:50381/qa_probe (DATABASE_URL from the process environment)`, hasła nie ma w wyjściu.
- Nie zrobione: ostrzeżenie o cieniu `.env` sprawdzone tylko testami jednostkowymi (w worktree nie ma `.env`, a `AGENTS.md` zabrania go czytać); `test:e2e` i `smoke` (bez zmian stron i API); protokół nie został użyty w prawdziwej sesji QA.

## Wynik
Dług i decyzje: ostrzeżenie nie przerywa polecenia (decyzja koordynatora: „warn loudly”); odmowa należy do protokołu QA (krok 4). Linia `db:` w CLI MikroORM drukuje się także przy `migration:create`.

## Lekcje
`.ai/lessons/2026-11-08-qa-with-agents-protocol.md`.
