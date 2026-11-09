---
date: 2026-11-08
updated:
area: process
status: active
source: .ai/runs/2026-11-08-lesson-18-qa-protocol.md
promoted:
---

# QA agenta jest wiarygodne dopiero z wyrocznią, niezależnym weryfikatorem i znanym celem bazy

## Kontekst
Lekcja 18 kursu („tester z AI”) dopasowana do repozytorium, w którym właściciel nie jest domyślnym testerem równoległym. W lekcji wyeksportowany `DATABASE_URL` skierował seeder na obcą bazę, a agent kliknął w zły element i mimo to zaraportował PASS.

## Przyczyna
Agent testujący własne założenia nie widzi własnych błędów; „przeszło” bez wyroczni (AC, linia docs) nic nie znaczy; zrzut nieobejrzany nie jest dowodem; środowisko nieweryfikowane (cel bazy, cień `DATABASE_URL`, prawdziwe dane po zalogowaniu) unieważnia całą sesję.

## Reguła
Sesję QA prowadź według `.ai/docs/qa-protocol.md`: plan z kolumną „wyrocznia” przed klikaniem, kontrola środowiska (cel bazy `host:port/nazwa`, bez cienia `DATABASE_URL`), wykonanie w prawdziwej przeglądarce z etykietą metody, niezależny weryfikator w świeżym kontekście, raport jako szkic komentarza (publikuje sesja nadrzędna), wpis w `.ai/qa/knowledge/` także przy zerze błędów, sekcja „Wymaga ludzkiego oka” zbierana w jedną listę dla właściciela. Polecenia operatora same drukują cel bazy na stderr i ostrzegają przy cieniu `.env` (`packages/db/src/db-target.ts`). Powtarzasz prośbę: przenieś ją piętro wyżej (prompt, skill lub dokument, `AGENTS.md`).

## Jak sprawdzić
`npm test -w @wine-match/db` (plik `db-target.test.ts`), `npm run check:qa`, `npm run check:context`. Protokół nie został jeszcze użyty w prawdziwej sesji QA: pierwszy wpis w `.ai/qa/knowledge/` to seed.
