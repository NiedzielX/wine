---
started: 2026-11-09 14:11
ended: 2026-11-09 14:20
agent: Claude Code / claude-opus-5-5 (pod-agent, worktree)
spec: brak — dokumentacja procesu i mały skrypt narzędziowy (bez kodu produktu); draft spec harnessu: .ai/specs/2026-11-09-multi-family-review-harness.md
outcome: success
related: [.ai/runs/2026-11-07-review-protocol-lesson-17.md]
---

# Lekcja 21 (praca wielomodelowa) w procesie: niezależność recenzentów, schematy wejścia/wyjścia recenzenta, walidator

## Zadanie
Przenieść lekcję 21 kursu (orkiestrator / implementer / recenzenci, różne rodziny modeli, 3 rundy, triage uwag po jednej, nie głosowaniem) do procesu: sekcja w `review-protocol.md`, lista triage w `review-checklists.md`, schematy JSON wejścia i wyjścia recenzenta, `scripts/review-validate.mjs` z testami (najpierw czerwone), wskazówka w `parallel-work.md`, lekcja i draft specyfikacji opcjonalnego harnessu wielorodzinnego (bez implementacji). Gałąź `docs/lesson-21-multi-model-review`, bez push i PR.

## Przebieg
- 14:11 Gałąź z `origin/main` (dc13b66). Przeczytane: `AGENTS.md`, `review-protocol.md`, `review-checklists.md`, `parallel-work.md`, `nightly-review-routine.md`, `review-pack.mjs` (+ lib), `process-templates.md`, `commands.md`, lekcje 17 i main-guard. `npm ci` w worktree (brak `node_modules`).
- Konwencja schematów: w repo nie ma `*.schema.json` ani katalogu schematów; zgodnie z briefem `.ai/schemas/`.
- `npm ci` z npm 10 odmawia (`engines` npm ≥ 11.6); użyte `npx -y npm@11.20.0 ci` (wersja z `packageManager`).
- Schematy `review-input` (bez pola na uzasadnienie autora: `additionalProperties: false`, `round` 1–3, `findingsRequested`) i `review-output` (każde ustalenie z `evidence` ≥ 10 znaków, `inputDigest` SHA-256, `reviewer.family`/`model`). Walidator bez zależności: interpreter podzbioru JSON Schema, nieznane słowo kluczowe schematu = wyjątek (fail closed); reguły między plikami: digest i runda odpowiedzi względem jednego wejścia, unikalne id ustaleń, `min ≤ max`.
- Test najpierw: `packages/testkit/tests/review-validate.test.ts` czerwony (moduł nie istnieje), potem skrypt, zielony 12/12. Mutacje (wyłączone `additionalProperties: false`, wyłączone sprawdzenie digestu) dają 3 czerwone testy; kod przywrócony.
- Lista „triage” w `review-checklists.md` pod znacznikiem `<!-- checklist:triage -->`: bez znacznika weszłaby do sekcji `docs`, którą `review:pack` wkleja recenzentowi. `review-pack.test.ts`: oczekiwana lista znaczników + nowy test, że pakiet z przejściem `docs` nie zawiera listy triage.
- `review-protocol.md` §9, wskazówka `parallel-work.md` §1.12, wiersz w `commands.md`, lekcja, draft specyfikacji harnessu. `AGENTS.md` bez zmian (budżet).

## Weryfikacja
- `npx vitest run tests/review-validate.test.ts` przed skryptem: FAIL (import), po: 12 passed; `tests/review-pack.test.ts`: 32 passed.
- `npm run lint`: exit 0. `npm run typecheck`: exit 0.
- `npm test`: exit 0 (743 + 126 + 62 + 500 + 441 testów, wszystkie zielone).
- `npm run check:context`: 0 błędów, 13 ostrzeżeń (wszystkie istniały wcześniej; `.ai/lessons.md` 15921 B z limitu 16384 B).
- `npm run check:qa`: 97 scenariuszy OK. `npm run check:routes`: OK (25 handlerów). `npm run secrets:scan`: tylko wpisy z allowlisty.
- `npm run review:validate` bez argumentów: kod 2; na pliku schematu: kod 1 („kind must be…”).
- `npm run build` nie uruchomiony: zmiana nie dotyka kodu pakietów budowanych (tylko `scripts/`, testy w `testkit`, dokumenty).

## Wynik
Gotowe lokalnie na gałęzi `docs/lesson-21-multi-model-review`, bez push i PR. Niezweryfikowane: druga rodzina modeli nie istnieje (opisane jako brak), harness tylko jako draft. Dług: `.ai/lessons.md` ma ~460 B zapasu do limitu: przy następnej lekcji trzeba oznaczyć część lekcji jako nieaktualne albo awansować je do `AGENTS.md`.

## Poprawki po review PR #140 (2026-11-09, ten sam przebieg)
- Uwagi koordynatora potwierdzone w kodzie: (1) sprawdzenie digestu i rundy działało tylko przy dokładnie jednym wejściu, więc sama odpowiedź z dowolnym `inputDigest` dawała OK; (2) komunikat błędu parsowania przepisywał `e.message` V8, który cytuje początek pliku, a wyjście podawało tylko `basename`; (3) brak sprawdzenia, że odpowiedzi są od różnych recenzentów; (4) za mało miejsca w `.ai/lessons.md`.
- Najpierw testy: 7 nowych lub zmienionych testów w `review-validate.test.ts` czerwonych na kodzie z `9c2c8e1` (brak wejścia, dwa wejścia, nieparsowalne i niepoprawne wejście, ten sam recenzent i ten sam plik dwa razy, treść pliku w komunikacie, ścieżka jak podana, liczba rodzin w podsumowaniu), potem poprawka: 18/18 zielonych.
- Poprawka: odpowiedź wymaga dokładnie jednego wejścia i to poprawnego; błąd parsowania ma stały komunikat i tylko pozycję; błędy podają ścieżkę jak podana; para `reviewer.family/model` unikalna, ten sam plik (te same bajty) dwa razy to błąd; podsumowanie podaje liczbę wejść, odpowiedzi i rodzin. §9 i `commands.md` mówią wprost, że skrypt nie sprawdza kompletu odpowiedzi (nie wie, ilu recenzentów zlecono).
- `.ai/lessons.md`: żadna lekcja nie jest jednoznacznie nieaktualna (sprawdzona najbliższa kandydatka `npm-11-for-vitest-5`: nadal aktualna), więc nic nie przeniesiono do „Nieaktualne”. Skrócone: własna linia i opisy czterech najdłuższych linii indeksu (e2e bez JS, Postgres bez Dockera, testy SSR, macierz silnika) do jednego zdania; pliki lekcji bez zmian. Rozmiar 15921 → 15185 B (zapas 1199 B).
- Weryfikacja: lint 0, typecheck 0, `npm test` 0 (743 + 126 + 62 + 500 + 447), `check:context` 0 błędów (13 starych ostrzeżeń), `check:qa` OK, `check:routes` OK, `secrets:scan` tylko allowlista.

## Lekcje
- `.ai/lessons/2026-11-09-reviewers-from-different-model-families.md`
